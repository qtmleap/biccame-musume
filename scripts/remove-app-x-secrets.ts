import { z } from 'zod'

// app Workerから旧X投稿用の認証情報だけを削除する。botの同名secretには触れない。
export const legacyAppXKeys = ['TWITTER_AUTH_TOKEN', 'TWITTER_CSRF_TOKEN', 'TWITTER_ACCESS_TOKEN', 'TWITTER_API_KEY'] as const
const appWorkers = ['biccame-musume-prod', 'biccame-musume-dev'] as const

export const planSecretRemoval = (worker: string, bindings: { name: string; type: string }[]) => {
  if (!appWorkers.some((name) => name === worker)) throw new Error('Only app Workers may be cleaned')
  return bindings.filter((binding) => legacyAppXKeys.some((key) => key === binding.name))
}

if (import.meta.main) {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID
  const token = process.env.CLOUDFLARE_API_TOKEN
  if (!account || !token) throw new Error('Cloudflare account and token are required')
  const dryRun = !process.argv.includes('--apply')
  const headers = { Authorization: `Bearer ${token}` }
  const bindingSchema = z.object({ result: z.object({ bindings: z.array(z.object({ name: z.string().nonempty(), type: z.string().nonempty() })) }) })
  for (const worker of appWorkers) {
    const base = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${worker}`
    const settings = bindingSchema.safeParse(await (await fetch(`${base}/settings`, { headers })).json())
    if (!settings.success) throw new Error(`Invalid settings for ${worker}`)
    const targets = planSecretRemoval(worker, settings.data.result.bindings)
    for (const target of targets) {
      if (dryRun) { console.log(JSON.stringify({ worker, wouldRemove: target.name, type: target.type })); continue }
      // secret_textはSecrets API、plain_textは設定のbinding一覧から除外する。
      if (target.type === 'secret_text') {
        const response = await fetch(`${base}/secrets/${target.name}`, { method: 'DELETE', headers })
        const body = z.object({ success: z.boolean() }).safeParse(await response.json())
        if (!response.ok || !body.success || !body.data.success) throw new Error(`Failed to remove ${target.name} from ${worker}`)
      } else {
        console.log(JSON.stringify({ worker, skipped: target.name, reason: 'plain_text is managed by deploy vars, not secrets' }))
        continue
      }
      console.log(JSON.stringify({ worker, removed: target.name }))
    }
  }
}
