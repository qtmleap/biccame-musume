import { z } from 'zod'

/**
 * 「終了」または「継続」と判定された投稿の連携先の提案（未終了のイベントから Clef が選んだ 1 件）。
 * title は提案した時点のイベント名の写しで、画面のリンク表示に使う。提案は確認用であり、イベント本体も受信ジョブの連携先も変更しない。
 */
export const WebhookLinkedEventSchema = z.object({
  eventId: z.uuid(),
  title: z.string().nonempty(),
  probability: z.number().min(0).max(1)
})
export type WebhookLinkedEvent = z.infer<typeof WebhookLinkedEventSchema>

/** 企画の発見と、登録・更新へ進めるかの判断を分離する。旧履歴はnullとして扱う。 */
export const WebhookDiscoverySchema = z.object({
  relevance: z.enum(['detected', 'uncertain', 'not_detected']),
  action: z.enum(['create', 'update', 'end', 'review', 'none']),
  confidence: z.number().min(0).max(1).nullable(),
  evidence: z.array(z.string().nonempty()),
  missingFields: z.array(z.string().nonempty()),
  reasons: z.array(z.string().nonempty()),
  /** 終了または継続と判定された投稿にだけ付く、連携先の提案。旧履歴・提案なしは持たない。 */
  linkedEvent: WebhookLinkedEventSchema.optional()
})
export type WebhookDiscovery = z.infer<typeof WebhookDiscoverySchema>

/** 明示的な元告知参照で見つかった候補。ここでイベント本体を更新しない。 */
export const WebhookRelatedEventsSchema = z.object({
  basis: z.literal('source_reference'),
  events: z.array(z.object({ eventId: z.uuid(), title: z.string().nonempty(), sourceUrl: z.url() }))
})
