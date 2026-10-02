import { EventSchema } from '@/schemas/event.dto'
export const events = (['ongoing', 'upcoming', 'last_day', 'ended'] as const).map((status, index) =>
  EventSchema.parse({
    uuid: `00000000-0000-4000-8000-00000000000${index}`,
    title: '限定名刺・秋のお買い物キャンペーン 特別記念プレゼントのお知らせ',
    category: 'limited_card',
    stores: ['nagoyagate'],
    startDate: status === 'upcoming' ? '2026-10-04' : '2026-09-28',
    endDate: index === 1 ? undefined : '2026-10-05',
    conditions: [{ uuid: '00000000-0000-4000-8000-000000000010', type: 'purchase', purchaseAmount: 1000 }],
    isVerified: true,
    isPreliminary: false,
    limitedQuantity: 100,
    status,
    daysUntil: status === 'upcoming' ? 2 : 0,
    interestedCount: 0,
    completedCount: 0,
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01'
  })
)
