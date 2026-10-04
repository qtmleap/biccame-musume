import { expect, test } from 'bun:test'
import { eventOgPlace } from '../../workers/app/src/utils/og-event-place'

test('store_character_is_not_repeated', () => {
  expect(eventOgPlace({ stores: ['chofu'] })).toEqual({ stores: ['京王調布店'], otherStoreCount: 0, character: null })
  expect(eventOgPlace({ stores: ['chofu'], characterId: 'chofu' }).character).toBeNull()
})

test('different_character_is_shown_with_store', () => {
  expect(eventOgPlace({ stores: ['chofu'], characterId: 'seiseki' })).toEqual({
    stores: ['京王調布店'],
    otherStoreCount: 0,
    character: 'せいせきたん'
  })
})

test('special_character_shows_only_store', () => {
  expect(eventOgPlace({ stores: ['chofu'], characterId: 'other' }).character).toBeNull()
  expect(eventOgPlace({ stores: ['chofu'], characterId: 'secret' }).character).toBeNull()
})

test('stores_beyond_three_are_counted', () => {
  expect(eventOgPlace({ stores: ['hachioji', 'shibuhachi', 'yao'] })).toEqual({
    stores: ['JR八王子駅店', '渋谷ハチ公口店', 'アリオ八尾店'],
    otherStoreCount: 0,
    character: null
  })
  expect(eventOgPlace({ stores: ['hachioji', 'shibuhachi', 'yao', 'nagoya'] })).toEqual({
    stores: ['JR八王子駅店', '渋谷ハチ公口店'],
    otherStoreCount: 2,
    character: null
  })
})
