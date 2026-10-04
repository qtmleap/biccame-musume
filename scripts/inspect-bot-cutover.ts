import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'

// ユーザー認証で実行する読み取り専用確認。secret値とAPI生レスポンスは保存しない。
const envelope = z.object({
  success: z.boolean(), result: z.unknown(),
  errors: z.array(z.object({ code: z.number().optional() })).optional()
})
type MetadataReader = (path: string) => Promise<unknown>

export const inspectBotCutover = async (request: MetadataReader, account?: string) => {
  const accounts = z.array(z.object({ id: z.string().nonempty() })).safeParse(await request('/accounts'))
  if (!accounts.success) throw new Error('Invalid account list')
  if (!account || !accounts.data.some((item) => item.id === account)) {
    throw new Error(`Specify --account= explicitly; accessible account IDs: ${accounts.data.map((item) => item.id).join(',')}`)
  }
  const script = 'musume-workers'
  const base = `/accounts/${account}/workers/scripts/${script}`
  const schedules = z.object({ schedules: z.array(z.object({ cron: z.string().nonempty() })) })
    .safeParse(await request(`${base}/schedules`))
  const secrets = z.array(z.object({ name: z.string().nonempty(), type: z.string().nonempty() }))
    .safeParse(await request(`${base}/secrets`))
  const settings = z.object({ bindings: z.array(z.object({ name: z.string().nonempty(), type: z.string().nonempty() })) })
    .safeParse(await request(`${base}/settings`))
  const deployments = z.object({ deployments: z.array(z.object({
    id: z.string().nonempty(), created_on: z.string().nonempty(),
    versions: z.array(z.object({ version_id: z.string().nonempty(), percentage: z.number() }))
  })) }).safeParse(await request(`${base}/deployments`))
  if (!schedules.success || !secrets.success || !settings.success || !deployments.success) {
    throw new Error('Worker metadata validation failed; no raw data written')
  }
  const names = new Set([...secrets.data.map((secret) => secret.name), ...settings.data.bindings.map((binding) => binding.name)])
  const required = [
    'TWITTER_BEARER_TOKEN', 'TWITTER_AUTH_TOKEN', 'TWITTER_CSRF_TOKEN',
    'DISCORD_TOKEN', 'DISCORD_CHANNEL_ID', 'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_MODEL'
  ]
  return {
    inspectedAt: new Date().toISOString(), accountId: account, script,
    schedules: schedules.data.schedules, secretNames: secrets.data.map((secret) => secret.name),
    bindingNames: settings.data.bindings, deployments: deployments.data.deployments,
    missingBindings: required.filter((name) => !names.has(name))
  }
}

if (import.meta.main) {
  const token = process.env.CLOUDFLARE_API_TOKEN
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN is required in the invoking environment')
  const request: MetadataReader = async (path) => {
    const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000), redirect: 'error'
    })
    const parsed = envelope.safeParse(await response.json())
    if (!parsed.success) throw new Error(`Cloudflare response validation failed (HTTP ${response.status})`)
    if (!response.ok || !parsed.data.success) {
      const codes = parsed.data.errors?.map((error) => error.code).join(',')
      throw new Error(`Cloudflare request failed (HTTP ${response.status}; codes=${codes})`)
    }
    return parsed.data.result
  }
  const requested = process.argv.find((argument) => argument.startsWith('--account='))?.slice(10)
  const result = await inspectBotCutover(request, requested ? requested : process.env.CLOUDFLARE_ACCOUNT_ID)
  const directory = resolve(import.meta.dirname, '../.cache')
  mkdirSync(directory, { recursive: true })
  const output = resolve(directory, 'bot-cutover-inspection.json')
  writeFileSync(output, JSON.stringify(result, null, 2))
  console.log(JSON.stringify({ output, accountId: result.accountId, script: result.script, schedules: result.schedules, missingBindings: result.missingBindings }))
}
