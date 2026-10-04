import { expect, test } from 'bun:test'
import { botStores } from '@biccame/shared/stores'
import { buildBotStores } from '../scripts/generate-bot-stores'

const canonical = [
  { id: 'selected', character: { name: 'テスト店舗', twitter_id: 'Bic_CaseSensitive' } },
  { id: 'new-store', character: { name: '対象外の店舗', twitter_id: 'NewStore' } }
]

test('canonical generation preserves case and limits notification coverage to selected stores', () => {
  expect(buildBotStores(canonical, ['selected'])).toEqual([
    { id: 'selected', name: 'テスト店舗', twitter_id: 'Bic_CaseSensitive' }
  ])
})

test('missing/duplicate IDs and ambiguous Twitter accounts are rejected', () => {
  expect(() => buildBotStores(canonical, ['missing'])).toThrow('missing')
  expect(() => buildBotStores(canonical, ['selected', 'selected'])).toThrow('Invalid')
  expect(() => buildBotStores([...canonical, canonical[0]], ['selected'])).toThrow('Duplicate canonical store ID')
  expect(() =>
    buildBotStores(
      [canonical[0], { id: 'duplicate-account', character: canonical[0].character }],
      ['selected', 'duplicate-account']
    )
  ).toThrow('Duplicate canonical bot account')
})

test('committed generated data exactly matches the canonical public JSON and fixed inventory', async () => {
  const canonical = await Bun.file(new URL('../workers/app/public/characters.json', import.meta.url)).json()
  const inventory = await Bun.file(new URL('../packages/shared/data/bot-store-ids.json', import.meta.url)).json()
  expect(botStores).toEqual(buildBotStores(canonical, inventory))
  expect(botStores).toHaveLength(40)
})
