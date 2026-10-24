import { expect, test } from 'bun:test'
import { eventOgPlace } from '@biccame/shared/domain/og-event-place'

test('未判定の対象を開催店舗から補完しない', () => {
  expect(eventOgPlace({ stores: ['chofu'], characterIds: [] })).toEqual({
    stores: ['京王調布店'],
    otherStoreCount: 0,
    character: null
  })
})

test('開催店舗と対象の全ビッカメ娘を別々に表示する', () => {
  expect(eventOgPlace({ stores: ['funabashi'], characterIds: ['funato', 'kawasaki'] })).toEqual({
    stores: ['船橋駅FACE店'],
    otherStoreCount: 0,
    character: 'ふなとーたん・川崎たん'
  })
  expect(eventOgPlace({ stores: ['chofu'], characterIds: ['chofu'] }).character).toBe('調布たん')
})

test('特殊対象も開催店舗の娘に置き換えない', () => {
  expect(eventOgPlace({ stores: ['chofu'], characterIds: ['other'] }).character).toBe('その他')
  expect(eventOgPlace({ stores: ['chofu'], characterIds: ['secret'] }).character).toBe('シークレット')
})

test('stores_beyond_three_are_counted', () => {
  expect(eventOgPlace({ stores: ['hachioji', 'shibuhachi', 'yao'], characterIds: [] })).toEqual({
    stores: ['JR八王子駅店', '渋谷ハチ公口店', 'アリオ八尾店'],
    otherStoreCount: 0,
    character: null
  })
  expect(eventOgPlace({ stores: ['hachioji', 'shibuhachi', 'yao', 'nagoya'], characterIds: [] })).toEqual({
    stores: ['JR八王子駅店', '渋谷ハチ公口店'],
    otherStoreCount: 2,
    character: null
  })
})
