import { expect, test } from 'bun:test'
import { legacyAppXKeys, planSecretRemoval, planVariablePatch, verifyRemoval } from '../scripts/remove-app-x-secrets'

const bindings = [
  { name: 'TWITTER_AUTH_TOKEN', type: 'secret_text' },
  { name: 'TWITTER_CSRF_TOKEN', type: 'secret_text' },
  { name: 'TWITTER_API_KEY', type: 'plain_text' },
  { name: 'JWT_SECRET_KEY', type: 'secret_text' },
  { name: 'TURNSTILE_SECRET_KEY', type: 'plain_text' },
  { name: 'BOT', type: 'service' },
  { name: 'DB', type: 'd1' }
]

test('only the legacy X credentials of the app Workers are selected', () => {
  expect(planSecretRemoval('biccame-musume-prod', bindings).map((binding) => binding.name)).toEqual([
    'TWITTER_AUTH_TOKEN',
    'TWITTER_CSRF_TOKEN',
    'TWITTER_API_KEY'
  ])
  expect(planSecretRemoval('biccame-musume-dev', bindings)).toHaveLength(3)
  expect(legacyAppXKeys).not.toContain('JWT_SECRET_KEY')
})

test('the bot Worker and unknown Workers can never be cleaned', () => {
  for (const worker of ['musume-workers', 'musume-workers-staging', 'biccame-search-dev', '']) {
    expect(() => planSecretRemoval(worker, bindings)).toThrow('Only app Workers')
  }
})

test('variable patch keeps every other binding by inheriting it', () => {
  const removed = [{ name: 'TWITTER_API_KEY', type: 'plain_text' }]
  // secret削除後の一覧を想定する
  const current = bindings.filter((binding) => binding.type !== 'secret_text' || binding.name === 'JWT_SECRET_KEY')
  expect(planVariablePatch(current, removed)).toEqual([
    { type: 'inherit', name: 'JWT_SECRET_KEY' },
    { type: 'inherit', name: 'TURNSTILE_SECRET_KEY' },
    { type: 'inherit', name: 'BOT' },
    { type: 'inherit', name: 'DB' }
  ])
})

test('verification reports lost, retyped and leftover bindings', () => {
  const removed = ['TWITTER_AUTH_TOKEN', 'TWITTER_CSRF_TOKEN', 'TWITTER_API_KEY']
  const kept = bindings.filter((binding) => !removed.includes(binding.name))
  expect(verifyRemoval(bindings, kept, removed)).toEqual([])
  expect(verifyRemoval(bindings, kept.slice(1), removed)).toEqual(['lost JWT_SECRET_KEY:secret_text'])
  expect(verifyRemoval(bindings, [...kept, bindings[2]], removed)).toEqual(['unexpected TWITTER_API_KEY:plain_text'])
  expect(
    verifyRemoval(
      bindings,
      [...kept.slice(0, 1), { name: 'TURNSTILE_SECRET_KEY', type: 'secret_text' }, ...kept.slice(2)],
      removed
    )
  ).toEqual(['lost TURNSTILE_SECRET_KEY:plain_text', 'unexpected TURNSTILE_SECRET_KEY:secret_text'])
})
