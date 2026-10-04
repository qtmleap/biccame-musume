import dayjs from 'dayjs'
import type { Event } from '@/schemas/event.dto'
import { StoreDataSchema } from '@/schemas/store.dto'
import abenoImage from './assets/abeno.webp'

const characterResult = StoreDataSchema.safeParse({
  id: 'abeno',
  prefecture: '大阪府',
  character: {
    name: 'あべのたん',
    description:
      'ビックカメラあべのキューズモール店の擬人化キャラクター。たこ焼きの髪飾りが特徴。長い紹介文と店舗名を確認するための固定モックです。',
    twitter_id: 'bic_abeno',
    images: ['images/abeno4.png'],
    birthday: '2016-09-07',
    is_biccame_musume: true
  },
  store: { name: 'ビックカメラあべのキューズモール店', access: [] }
})
if (!characterResult.success) throw new Error('Invalid Storybook character fixture')
export const character = {
  ...characterResult.data,
  character: { ...characterResult.data.character, image_url: abenoImage }
}
export const longNameCharacter = {
  ...character,
  id: 'takatsuki',
  character: { ...character.character, name: 'たかつきたん（高槻阪急スクエア店）' },
  store: { ...character.store, name: 'ビックカメラ高槻阪急スクエア店', access: [] }
}

const event: Event = {
  uuid: '00000000-0000-4000-8000-000000000001',
  category: 'limited_card',
  title: 'ビッカメ娘のお誕生日と店舗周年を記念した限定名刺プレゼント',
  stores: ['abeno'],
  startDate: dayjs('2026-10-01T00:00:00+09:00').toDate(),
  endDate: dayjs('2026-10-31T23:59:59+09:00').toDate(),
  conditions: [{ uuid: '00000000-0000-4000-8000-000000000011', type: 'everyone' }],
  isVerified: true,
  isPreliminary: false,
  status: 'ongoing',
  daysUntil: 0,
  interestedCount: 12,
  completedCount: 3,
  createdAt: dayjs('2026-09-01T00:00:00+09:00').toDate(),
  updatedAt: dayjs('2026-09-01T00:00:00+09:00').toDate()
}
export const events: Event[] = [
  event,
  {
    ...event,
    uuid: '00000000-0000-4000-8000-000000000002',
    title: '店舗限定アクリルキーホルダー',
    category: 'ackey',
    stores: ['takatsuki'],
    status: 'upcoming',
    daysUntil: 3,
    startDate: dayjs('2026-10-05T00:00:00+09:00').toDate(),
    conditions: [{ uuid: '00000000-0000-4000-8000-000000000012', type: 'purchase', purchaseAmount: 2000 }],
    limitedQuantity: 100
  },
  {
    ...event,
    uuid: '00000000-0000-4000-8000-000000000003',
    title: '配布終了した記念名刺',
    category: 'regular_card',
    status: 'ended',
    endDate: dayjs('2026-10-01T00:00:00+09:00').toDate(),
    daysUntil: -1
  },
  {
    ...event,
    uuid: '00000000-0000-4000-8000-000000000004',
    title: '本日最終日のコラボイベント',
    category: 'other',
    status: 'last_day',
    daysUntil: 0,
    endDate: dayjs('2026-10-02T23:59:59+09:00').toDate()
  }
]
export const calendarEvents = [
  { date: '2026-10-05', character, type: 'character' as const, years: 10 },
  { date: '2026-10-05', character: longNameCharacter, type: 'store' as const, years: 3 }
]
