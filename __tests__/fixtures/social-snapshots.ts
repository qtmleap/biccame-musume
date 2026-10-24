import { buildSummarySnapshot } from '@biccame/shared/domain/social-post'
import { type Event, EventSchema } from '@biccame/shared/schemas/event.dto'
import type { SocialSnapshot } from '@biccame/shared/social'

/** 2026-10-12（月曜）の JST 朝。毎朝は10/12の1日、毎週は10/12〜10/18の週になる。 */
export const SOCIAL_SCHEDULED_AT = '2026-10-12T00:00:00.000Z'

export const socialUuid = (n: number): string => `550e8400-e29b-41d4-a716-${String(n).padStart(12, '0')}`

const minute = (index: number): string => String(index % 60).padStart(2, '0')

export const socialEvent = (n: number, input: Record<string, unknown> = {}): Event => {
  const parsed = EventSchema.safeParse({
    uuid: socialUuid(n),
    title: `イベント${n}`,
    category: 'limited_card',
    stores: ['akiba'],
    characterIds: ['akiba'],
    startDate: '2026-10-12T10:00:00+09:00',
    endDate: '2026-10-18T23:59:59+09:00',
    isVerified: true,
    isPreliminary: false,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    conditions: [],
    status: 'ongoing',
    daysUntil: 0,
    interestedCount: 0,
    completedCount: 0,
    ...input
  })
  if (!parsed.success) throw new Error('Invalid fixture')
  return parsed.data
}

/** 今日（2026-10-12 JST）に開始するイベント。題名が違うので行にまとまらない。 */
export const startingToday = (n: number): Event =>
  socialEvent(n, { title: `開始${n}`, startDate: `2026-10-12T10:${minute(n)}:00+09:00` })

/** 今日（2026-10-12 JST）に終了するイベント。題名が違うので行にまとまらない。 */
export const endingToday = (n: number): Event =>
  socialEvent(n, {
    title: `終了${n}`,
    startDate: '2026-10-01T10:00:00+09:00',
    endDate: `2026-10-12T20:${minute(n)}:00+09:00`
  })

/** n 件目から count 件ぶんの連番。 */
export const socialRange = (from: number, count: number): number[] => Array.from({ length: count }, (_, i) => from + i)

export const dailySnapshot = (startingCount: number, endingCount: number): SocialSnapshot => {
  const snapshot = buildSummarySnapshot({
    kind: 'daily',
    scheduledAt: SOCIAL_SCHEDULED_AT,
    starting: socialRange(1, startingCount).map(startingToday),
    ending: socialRange(1001, endingCount).map(endingToday)
  })
  if (snapshot === null) throw new Error('Expected a snapshot')
  return snapshot
}
