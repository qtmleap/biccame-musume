import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getPlatformProxy } from 'wrangler'
import type { BotRpc } from '@biccame/shared/bot'

// devサーバーを立てず、remote Service Bindingを短命proxyで呼び出す読み取り専用検証。
const account = process.env.CLOUDFLARE_ACCOUNT_ID
const service = process.argv.find((argument) => argument.startsWith('--service='))?.slice(10)
if (!account || !service || !['musume-workers', 'musume-workers-staging'].includes(service)) throw new Error('Select a bot service explicitly with an account')
const root = resolve(import.meta.dirname, '..')
mkdirSync(resolve(root, '.cache'), { recursive: true })
const configPath = resolve(root, '.cache/bot-rpc-probe.json')
writeFileSync(configPath, JSON.stringify({
  name: 'bot-readonly-probe', account_id: account, compatibility_date: '2026-05-11',
  services: [{ binding: 'BOT', service, entrypoint: 'BotService', remote: true }]
}))
const proxy = await getPlatformProxy<{ BOT: BotRpc }>({ configPath, persist: false, remoteBindings: true })
try {
  const result = await proxy.env.BOT.ping({ requestId: 'readonly-cutover-probe' })
  console.log(JSON.stringify(result))
  if (process.argv.includes('--posting-session')) console.log(JSON.stringify(await proxy.env.BOT.postingSessionStatus()))
  if (process.argv.includes('--account-status')) {
    const status = await proxy.env.BOT.accountStatus()
    console.log(JSON.stringify(status.ok ? { accountProfileReadable: true } : { accountProfileReadable: false, kind: status.kind }))
  }
} finally { await proxy.dispose() }
