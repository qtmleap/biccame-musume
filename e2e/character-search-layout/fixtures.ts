import { StoreDataSchema } from '@/schemas/store.dto'
export const characters = [
  ['gate', 'なごやげーとたん', '名古屋JRゲートタワー店', '愛知県', ['ゲートちゃん']],
  ['tokyo', 'とうきょうたん', '東京駅前のとても長い店舗名を持つ合成店舗', '東京都', ['東京ちゃん']],
  ['kyoto', 'きょうとたん', '京都店', '京都府', ['京ちゃん']],
  ['other', 'おともだち', undefined, null, ['友ちゃん']]
].map(([id, name, store, prefecture, aliases]) =>
  StoreDataSchema.parse({
    id,
    prefecture,
    character: {
      name,
      aliases,
      description: '合成データ',
      images: ['fixture.png'],
      twitter_id: 'synthetic_fixture',
      is_biccame_musume: id !== 'other'
    },
    store: store ? { name: store, access: [] } : undefined
  })
)
