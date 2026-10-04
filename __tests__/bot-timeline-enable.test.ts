import { expect, test } from 'bun:test'
import { approvedPhase2Sha, planTimelineEnable } from '../scripts/enable-bot-timeline'

const stoppedAt = Date.parse('2026-10-04T01:30:00Z')
const checkpoint = {
  stage: 'old_cron_removed',
  stoppedAt: new Date(stoppedAt).toISOString(),
  earliestReplacementAt: new Date(stoppedAt + 30 * 60 * 1000).toISOString()
}
const bundle = new TextEncoder().encode('export default {}')
const bundleSha256 = new Bun.CryptoHasher('sha256').update(bundle).digest('hex')
const manifest = { sourceSha: approvedPhase2Sha, configPath: '/synthetic/wrangler.json', bundleSha256 }
const config = {
  name: 'musume-workers',
  main: 'index.js',
  triggers: { crons: [] },
  vars: { TL_NOTIFICATIONS_ENABLED: 'false' },
  services: []
}
const plan = (
  overrides: { checkpoint?: unknown; manifest?: unknown; config?: unknown; bundle?: Uint8Array; now?: number } = {}
) =>
  planTimelineEnable(
    overrides.checkpoint ? overrides.checkpoint : checkpoint,
    overrides.manifest ? overrides.manifest : manifest,
    () => JSON.stringify(overrides.config ? overrides.config : config),
    () => (overrides.bundle ? overrides.bundle : bundle),
    overrides.now ? overrides.now : stoppedAt + 31 * 60 * 1000
  )

test('enables only the approved disabled phase 2 bundle with the legacy cron', () => {
  expect(plan().args).toEqual([
    'wrangler',
    'deploy',
    '--config',
    '/synthetic/wrangler.json',
    '--var',
    'TL_NOTIFICATIONS_ENABLED:true',
    '--triggers',
    '*/5 0-12 * * *'
  ])
})

test('drain period, phase 3 source, changed bundle and enabled config are rejected', () => {
  expect(() => plan({ now: stoppedAt + 29 * 60 * 1000 })).toThrow('has not elapsed')
  expect(() => plan({ manifest: { ...manifest, sourceSha: '69a23c7a' } })).toThrow('approved isolated phase 2')
  expect(() => plan({ bundle: new TextEncoder().encode('changed') })).toThrow('bundle changed')
  expect(() => plan({ config: { ...config, triggers: { crons: ['*/5 0-12 * * *'] } } })).toThrow(
    'disabled production build'
  )
  expect(() => plan({ config: { ...config, services: [{ binding: 'APP' }] } })).toThrow('disabled production build')
  expect(() => plan({ checkpoint: { stage: 'stop_requested' } })).toThrow('not recorded')
})
