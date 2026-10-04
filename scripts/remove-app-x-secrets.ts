import { z } from 'zod'

// app Workerから旧X投稿用の認証情報だけを削除する。botの同名secretには触れない。
export const legacyAppXKeys = ['TWITTER_AUTH_TOKEN', 'TWITTER_CSRF_TOKEN', 'TWITTER_ACCESS_TOKEN', 'TWITTER_API_KEY'] as const
// devで結果を確かめてから本番へ進む
const appWorkers = ['biccame-musume-dev', 'biccame-musume-prod'] as const

type Binding = { name: string; type: string }

export const planSecretRemoval = (worker: string, bindings: Binding[]) => {
  if (!appWorkers.some((name) => name === worker)) throw new Error('Only app Workers may be cleaned')
  return bindings.filter((binding) => legacyAppXKeys.some((key) => key === binding.name))
}

/**
 * plain_text変数を外すsettings PATCHのbinding一覧。残すものはすべてinheritで値を引き継ぐ。
 * APIが一覧を置き換える場合も、差分として扱う場合も、残すbindingは失われない。
 */
export const planVariablePatch = (bindings: Binding[], removed: Binding[]) =>
  bindings
    .filter((binding) => !removed.some((target) => target.name === binding.name))
    .map((binding) => ({ type: 'inherit' as const, name: binding.name }))

/** 適用後のbindingが、外した名前以外は名前・種類とも元のままかを確かめる */
export const verifyRemoval = (before: Binding[], after: Binding[], removed: string[]): string[] => {
  const key = (binding: Binding) => `${binding.name}:${binding.type}`
  const expected = new Set(before.filter((binding) => !removed.includes(binding.name)).map(key))
  const actual = new Set(after.map(key))
  return [
    ...[...expected].filter((item) => !actual.has(item)).map((item) => `lost ${item}`),
    ...[...actual].filter((item) => !expected.has(item)).map((item) => `unexpected ${item}`)
  ]
}

if (import.meta.main) {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID
  const token = process.env.CLOUDFLARE_API_TOKEN
  if (!account || !token) throw new Error('Cloudflare account and token are required')
  const dryRun = !process.argv.includes('--apply')
  const headers = { Authorization: `Bearer ${token}` }
  const bindingSchema = z.object({
    result: z.object({ bindings: z.array(z.object({ name: z.string().nonempty(), type: z.string().nonempty() })) })
  })
  const resultSchema = z.object({ success: z.boolean() })
  const readBindings = async (base: string, worker: string): Promise<Binding[]> => {
    const settings = bindingSchema.safeParse(await (await fetch(`${base}/settings`, { headers })).json())
    if (!settings.success) throw new Error(`Invalid settings for ${worker}`)
    return settings.data.result.bindings
  }
  for (const worker of appWorkers) {
    const base = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${worker}`
    const before = await readBindings(base, worker)
    const targets = planSecretRemoval(worker, before)
    const secrets = targets.filter((target) => target.type === 'secret_text')
    const variables = targets.filter((target) => target.type === 'plain_text')
    for (const target of targets.filter((target) => !secrets.includes(target) && !variables.includes(target))) {
      throw new Error(`${target.name} on ${worker} has unexpected type ${target.type}`)
    }
    if (dryRun) {
      for (const target of targets) console.log(JSON.stringify({ worker, wouldRemove: target.name, type: target.type }))
      continue
    }
    // secret_textはSecrets APIで1件ずつ消す
    for (const target of secrets) {
      const response = await fetch(`${base}/secrets/${target.name}`, { method: 'DELETE', headers })
      const body = resultSchema.safeParse(await response.json())
      if (!response.ok || !body.success || !body.data.success) throw new Error(`Failed to remove ${target.name} from ${worker}`)
      console.log(JSON.stringify({ worker, removed: target.name, type: target.type }))
    }
    // plain_textはSecrets APIでは消せないため、settingsのbinding一覧から外す
    if (variables.length > 0) {
      const current = await readBindings(base, worker)
      const form = new FormData()
      form.set(
        'settings',
        new Blob([JSON.stringify({ bindings: planVariablePatch(current, variables) })], { type: 'application/json' })
      )
      const response = await fetch(`${base}/settings`, { method: 'PATCH', headers, body: form })
      const body = resultSchema.safeParse(await response.json())
      if (!response.ok || !body.success || !body.data.success) {
        throw new Error(`Failed to remove variables from ${worker} (HTTP ${response.status})`)
      }
      for (const target of variables) console.log(JSON.stringify({ worker, removed: target.name, type: target.type }))
    }
    const problems = verifyRemoval(before, await readBindings(base, worker), targets.map((target) => target.name))
    // devで想定外の結果が出たら本番へ進まない
    if (problems.length > 0) throw new Error(`${worker} bindings differ after cleanup: ${problems.join(', ')}`)
    console.log(JSON.stringify({ worker, verified: true }))
  }
}
