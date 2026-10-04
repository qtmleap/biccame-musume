import { expect, test } from 'bun:test'
import { legacyAppXKeys, planSecretRemoval } from '../scripts/remove-app-x-secrets'

const bindings = [
  { name: 'TWITTER_AUTH_TOKEN', type: 'secret_text' },
  { name: 'TWITTER_CSRF_TOKEN', type: 'secret_text' },
  { name: 'TWITTER_API_KEY', type: 'plain_text' },
  { name: 'JWT_SECRET_KEY', type: 'secret_text' },
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
