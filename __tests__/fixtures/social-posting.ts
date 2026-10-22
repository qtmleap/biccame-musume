import { eventSocialSnapshot } from '@api/services/bot-announcement'
import { EventDetailSchema } from '@biccame/shared/schemas/event.dto'
import type { SocialSnapshot } from '@biccame/shared/social'

export const event = (index = 0, verified = true) => {
  const parsed = EventDetailSchema.safeParse({
    uuid: `550e8400-e29b-41d4-a716-${String(index).padStart(12, '0')}`,
    title: 'テスト配布',
    category: 'limited_card',
    stores: ['akiba'],
    characterIds: ['akiba'],
    startDate: '2026-10-12T00:00:00+09:00',
    endDate: '2026-10-18T23:59:59+09:00',
    isVerified: verified,
    isPreliminary: false,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    conditions: [],
    referenceUrls: [],
    comments: [],
    status: 'ongoing',
    daysUntil: 0,
    interestedCount: 0,
    completedCount: 0
  })
  if (!parsed.success) throw new Error('Invalid fixture')
  return parsed.data
}
export const snapshot = (key: string): SocialSnapshot => ({ ...eventSocialSnapshot(event(), 'created'), key })
