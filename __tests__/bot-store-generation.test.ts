import { expect, test } from 'bun:test'
import { botStores } from '@biccame/shared/stores'
import detectionCatalog from '../packages/shared/src/generated/detection-catalog.json'
import { buildBotStores, buildDetectionCatalog } from '../scripts/generate-bot-stores'

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
  const canonical = await Bun.file(new URL('../workers/web/public/characters.json', import.meta.url)).json()
  const inventory = await Bun.file(new URL('../packages/shared/data/bot-store-ids.json', import.meta.url)).json()
  expect(botStores).toEqual(buildBotStores(canonical, inventory))
  expect(botStores).toHaveLength(40)
})

test('canonical detection store names omit whitespace after the brand and preserve internal English spacing', async () => {
  const canonical = await Bun.file(new URL('../workers/web/public/characters.json', import.meta.url)).json()
  const catalog = buildDetectionCatalog(canonical)
  expect(catalog).toEqual(detectionCatalog)
  for (const store of catalog.stores) {
    expect(store.name).not.toMatch(/^ビックカメラ\s/u)
  }
  expect(
    catalog.stores
      .filter((store) => ['chiba', 'fujisawa', 'pkan', 'urawa'].includes(store.id))
      .map(({ id, name }) => ({ id, name }))
  ).toEqual([
    { id: 'chiba', name: 'ビックカメラ千葉駅前店' },
    { id: 'fujisawa', name: 'ビックカメラ藤沢店' },
    { id: 'pkan', name: 'ビックカメラ池袋カメラ・パソコン館' },
    { id: 'urawa', name: 'ビックカメラ浦和西口店' }
  ])
  expect(catalog.stores.find((store) => store.id === 'itt')?.name).toBe('ビックカメラ池袋西口IT tower店')
})
