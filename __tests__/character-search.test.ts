import { expect, test } from 'bun:test'
import { StoreDataSchema } from '@/schemas/store.dto'
import { filterCharactersByRegion } from '@/utils/character'

const characters = [
  StoreDataSchema.parse({
    id: 'gate',
    prefecture: '愛知県',
    character: { name: 'なごやげーとたん', aliases: ['ゲートちゃん'], description: '合成データ', images: ['gate.png'] },
    store: { name: '名古屋JRゲートタワー店', access: [] }
  }),
  StoreDataSchema.parse({
    id: 'tokyo',
    prefecture: '東京都',
    character: { name: 'とうきょうたん', description: '合成データ', images: ['tokyo.png'] }
  })
]
for (const query of ['ナゴヤ ゲート', 'ｹﾞｰﾄ　ﾁｬﾝ', '名古屋 JR']) {
  test(`名前・別名・店舗から検索: ${query}`, () => {
    expect(filterCharactersByRegion(characters, 'all', query).map((c) => c.id)).toEqual(['gate'])
  })
}
test('地域と検索はAND条件', () => {
  expect(filterCharactersByRegion(characters, 'kanto', 'ゲート')).toEqual([])
})
test('空白のみは全件、見つからない条件は0件', () => {
  expect(filterCharactersByRegion(characters, 'all', '　 \n')).toEqual(characters)
  expect(filterCharactersByRegion(characters, 'all', '見つからない')).toEqual([])
})
