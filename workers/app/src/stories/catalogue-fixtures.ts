import dayjs from 'dayjs'
import type { ZodType } from 'zod'
import type { RouteResult } from '@/components/route/types'
import { BadgeSchema } from '@/schemas/badge.dto'
import { CommentResponseSchema } from '@/schemas/comment.dto'
import { EventGroupDetailSchema } from '@/schemas/event-group.dto'
import * as reviewFixtures from './fixtures'

const { character, longNameCharacter } = reviewFixtures
const parseFixture = <T>(schema: ZodType<T>, input: unknown): T => {
  const result = schema.safeParse(input)
  if (!result.success) throw new Error(`Invalid catalogue fixture: ${result.error.message}`)
  return result.data
}
export const events = reviewFixtures.events.map((event, index) =>
  index === 2 ? { ...event, limitedQuantity: 100 } : event
)
export const now = '2026-10-02T03:00:00.000Z'
export const characters = [
  character,
  longNameCharacter,
  {
    ...character,
    id: 'kyoto',
    character: { ...character.character, name: 'きょうとたん', birthday: '2016-10-02' },
    prefecture: '京都府'
  }
].map((c, index) => ({
  ...c,
  coordinates: { latitude: 34.64 + index * 0.02, longitude: 135.51 },
  store: {
    ...c.store,
    address: '大阪府大阪市阿倍野区（Storybook合成住所）',
    phone: '06-0000-0000',
    birthday: '2011-04-26',
    store_id: 1,
    hours: [{ type: 'all' as const, open_time: '10:00', close_time: '21:00' }],
    access: [{ station: '天王寺駅', lines: ['JR線'], description: '徒歩3分' }]
  }
}))
export const badge = parseFixture(BadgeSchema, {
  code: 'store_visit_abeno',
  category: 'store',
  sub_category: 'visit',
  name: 'あべの店訪問',
  description: '合成データの訪問バッジ',
  hint: '店舗を訪問',
  rarity: 'common',
  icon_name: 'MapPin',
  sort_order: 1,
  condition_meta: '{"storeKey":"abeno"}',
  is_hidden: false,
  created_at: now,
  updated_at: now,
  earned_count: 2
})
export const badges = [
  badge,
  {
    ...badge,
    code: 'special_catalogue',
    category: 'special' as const,
    sub_category: 'special_event_id' as const,
    rarity: 'epic' as const,
    name: 'イベント達成',
    condition_meta: JSON.stringify({ eventId: events[0].uuid })
  }
]
export const comments = [
  parseFixture(CommentResponseSchema, {
    id: '00000000-0000-4000-8000-000000000021',
    characterId: 'abeno',
    body: 'イベント楽しみにしています！',
    createdAt: now,
    verified: true
  })
]
export const eventDetail = {
  ...events[0],
  referenceUrls: [
    {
      uuid: '00000000-0000-4000-8000-000000000031',
      type: 'announce' as const,
      url: 'https://example.invalid/storybook-reference'
    }
  ],
  comments
}
export const group = parseFixture(EventGroupDetailSchema, {
  uuid: '00000000-0000-4000-8000-000000000041',
  title: '秋のお誕生日イベント',
  description: 'Storybook合成グループ',
  startDate: events[0].startDate,
  endDate: events[0].endDate,
  sortOrder: 0,
  eventCount: events.length,
  createdAt: now,
  updatedAt: now,
  events
})
export const rankedCharacters = characters.map((c, index) => ({ ...c, voteCount: [120, 80, 25][index] }))
export const stores = characters.map((c, index) => ({
  id: c.id,
  name: c.store.name ?? c.character.name,
  lat: c.coordinates.latitude,
  lng: c.coordinates.longitude,
  stations: ['天王寺駅', '大阪駅'],
  station: index === 0 ? '天王寺駅' : '大阪駅'
}))
export const routeResult = {
  status: 'estimated',
  route: stores,
  totalDistance: 14.2,
  totalDuration: '25分',
  legs: [
    {
      from: stores[0].name,
      to: stores[1].name,
      fromStation: '天王寺駅',
      toStation: '大阪駅',
      duration: 25,
      transfers: 0,
      routes: [{ operator: 'JR', line: '大阪環状線', from: '天王寺駅', to: '大阪駅', duration: 25 }]
    }
  ]
} satisfies RouteResult
export const calendarEvents = [
  { date: '2026-10-02', character: characters[2], type: 'character' as const, years: 10 },
  { date: '2026-10-02', character: characters[0], type: 'store' as const, years: 15 }
]
export const date = dayjs('2026-10-02')
