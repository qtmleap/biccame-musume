import { buildSummarySnapshot } from '@biccame/shared/domain/social-post'
import { type Event, EventSchema } from '@biccame/shared/schemas/event.dto'
import type { SocialSnapshot, SocialSummaryImage } from '@biccame/shared/social'

export const MONDAY = '2026-10-12T00:00:00.000Z'
export const uuid = (n: number) => `550e8400-e29b-41d4-a716-${String(n).padStart(12, '0')}`
export const minute = (index: number) => String(index).padStart(2, '0')
export const event = (n: number, input: Record<string, unknown> = {}): Event => {
  const parsed = EventSchema.safeParse({
    uuid: uuid(n),
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
/** 今日（2026-10-12 JST）に開始するイベント。時刻をずらして並びを決定的にする。 */
export const startingToday = (n: number, input: Record<string, unknown> = {}) =>
  event(n, { title: `開始${n}`, startDate: `2026-10-12T10:${minute(n % 60)}:00+09:00`, ...input })
/** 今日（2026-10-12 JST）に終了するイベント。 */
export const endingToday = (n: number, input: Record<string, unknown> = {}) =>
  event(n, {
    title: `終了${n}`,
    startDate: '2026-10-01T10:00:00+09:00',
    endDate: `2026-10-12T20:${minute(n % 60)}:00+09:00`,
    ...input
  })
export const required = <Value>(value: Value | null): Value => {
  if (value === null) throw new Error('Expected a snapshot')
  return value
}
export const daily = (starting: Event[], ending: Event[]) =>
  buildSummarySnapshot({ kind: 'daily', scheduledAt: MONDAY, starting, ending })
export const weekly = (starting: Event[], ending: Event[]) =>
  buildSummarySnapshot({ kind: 'weekly', scheduledAt: MONDAY, starting, ending })
export const summaries = (snapshot: SocialSnapshot, side: 'starting' | 'ending') =>
  snapshot.images.filter((image): image is SocialSummaryImage => image.type === 'summary' && image.side === side)
export const sideRows = (snapshot: SocialSnapshot, side: 'starting' | 'ending') =>
  summaries(snapshot, side).map((image) => image.rows)
