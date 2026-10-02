import { StoreDataSchema } from '@/schemas/store.dto'
import { events as sampleEvents } from '../visual-typography/fixtures'

export const character = {
  ...StoreDataSchema.parse({
    id: 'abeno',
    prefecture: '大阪府',
    postal_code: '545-0052',
    coordinates: { latitude: 34.646, longitude: 135.513 },
    character: {
      name: 'あべのたん',
      description:
        '明るく元気な案内役です。店舗とイベントをゆっくりチェックしてください。撮影用の合成プロフィールです。',
      twitter_id: 'fixture_abeno',
      birthday: '2000-10-02',
      is_biccame_musume: true,
      images: ['abeno.webp']
    },
    store: {
      name: 'ビックカメラ あべのキューズモール店（撮影用）',
      store_id: 1,
      address: '大阪府大阪市阿倍野区阿倍野筋一丁目6番1号 あべのキューズモール3階',
      phone: '06-0000-0000',
      hours: [
        { type: 'weekday', open_time: '10:00', close_time: '21:00' },
        { type: 'weekend', open_time: '10:00', close_time: '21:00' }
      ],
      open_all_year: true,
      access: [{ station: '天王寺駅', description: '中央改札から徒歩3分', lines: ['JR線', '大阪メトロ御堂筋線'] }],
      birthday: '2011-04-26'
    }
  }),
  character: {
    ...StoreDataSchema.parse({
      id: 'abeno',
      prefecture: '大阪府',
      character: {
        name: 'あべのたん',
        description:
          '明るく元気な案内役です。店舗とイベントをゆっくりチェックしてください。撮影用の合成プロフィールです。',
        twitter_id: 'fixture_abeno',
        birthday: '2000-10-02',
        is_biccame_musume: true,
        images: ['abeno.webp']
      }
    }).character,
    image_url: '/e2e/character-detail-layout/abeno.webp'
  }
}
export const characters = [
  character,
  ...['nanba', 'yao', 'takatsuki'].map((id, index) => ({
    ...character,
    id,
    character: { ...character.character, name: `近隣の娘${index + 1}` },
    coordinates: { latitude: 34.65 + index * 0.02, longitude: 135.52 }
  }))
]
export const events = sampleEvents.map((event) => ({ ...event, stores: ['abeno'] }))
