import { z } from 'zod'

/** 企画の発見と、登録・更新へ進めるかの判断を分離する。旧履歴はnullとして扱う。 */
export const WebhookDiscoverySchema = z.object({
  relevance: z.enum(['detected', 'uncertain', 'not_detected']),
  action: z.enum(['create', 'update', 'end', 'review', 'none']),
  confidence: z.number().min(0).max(1).nullable(),
  evidence: z.array(z.string().nonempty()),
  missingFields: z.array(z.string().nonempty()),
  reasons: z.array(z.string().nonempty())
})
export type WebhookDiscovery = z.infer<typeof WebhookDiscoverySchema>

/** 明示的な元告知参照で見つかった候補。ここでイベント本体を更新しない。 */
export const WebhookRelatedEventsSchema = z.object({
  basis: z.literal('source_reference'),
  events: z.array(z.object({ eventId: z.uuid(), title: z.string().nonempty(), sourceUrl: z.url() }))
})
