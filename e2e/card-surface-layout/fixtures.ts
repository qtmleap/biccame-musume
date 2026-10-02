import { EventSchema } from '@/schemas/event.dto'
import { characters } from '../character-search-layout/fixtures'

export { characters }
export const events = ['limited_card', 'regular_card', 'ackey', 'other'].map((category, index) =>
  EventSchema.parse({
    uuid: `550e8400-e29b-41d4-a716-${String(index).padStart(12, '0')}`,
    category,
    title:
      index === 1
        ? '秋の記念プレゼント・とても長いイベント名でも条件と開催店舗を比較できる合成データ'
        : '秋の記念プレゼント',
    stores: ['nagoyagate'],
    startDate: '2026-10-01',
    endDate: '2026-11-06',
    conditions: [],
    isVerified: true,
    isPreliminary: false,
    status: 'ongoing',
    daysUntil: 0,
    interestedCount: 0,
    completedCount: 0,
    createdAt: '2026-10-01',
    updatedAt: '2026-10-01'
  })
)
export const ranking = [...characters.slice(0, 3), ...characters.slice(0, 3)].map((character, index) => ({
  ...character,
  id: `rank-${index}`,
  voteCount: 600 - index * 90
}))
