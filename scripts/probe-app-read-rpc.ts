import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getPlatformProxy } from 'wrangler'
import type { AppBotReadRpc } from '@biccame/shared/bot'

// 投稿せず、bot → appの日次対象読み取りRPCだけを件数で確認する。本文は表示しない。
const account = process.env.CLOUDFLARE_ACCOUNT_ID
const service = process.argv.find((argument) => argument.startsWith('--service='))?.slice(10)
if (!account || !service || !['biccame-musume-prod', 'biccame-musume-dev'].includes(service)) throw new Error('Select an app service explicitly with an account')
const root = resolve(import.meta.dirname, '..')
mkdirSync(resolve(root, '.cache'), { recursive: true })
const configPath = resolve(root, '.cache/app-read-rpc-probe.json')
writeFileSync(configPath, JSON.stringify({
  name: 'app-readonly-probe', account_id: account, compatibility_date: '2026-05-11',
  services: [{ binding: 'APP', service, entrypoint: 'AppBotReadService', remote: true }]
}))
const proxy = await getPlatformProxy<{ APP: AppBotReadRpc }>({ configPath, persist: false, remoteBindings: true })
try {
  const result = await proxy.env.APP.dailyTargets({ scheduledAt: new Date().toISOString() })
  console.log(JSON.stringify(result.ok ? {
    ok: true, starting: result.targets.starting.eventUUIDs.length, startingTweets: result.targets.starting.texts.length,
    ending: result.targets.ending.eventUUIDs.length, endingTweets: result.targets.ending.texts.length
  } : result))
} finally { await proxy.dispose() }
