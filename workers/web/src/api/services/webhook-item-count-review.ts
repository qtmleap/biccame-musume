import { DetectionResultSchema } from '@biccame/shared/event-detect/detection'
import { ItemCountAuditSchema, itemCountReviewReasons } from '@biccame/shared/event-detect/extraction'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import { z } from 'zod'

const LegacyExtractionVersionSchema = z.enum([
  'legacy-single',
  'giveaways-v1',
  'giveaways-v2',
  'giveaways-v3-associations',
  'giveaways-v4-gift-card',
  'giveaways-v5-limited-sales-charge'
])
type LegacyRetry = { post: DetectPost; resultJson: string | null }
const unknownAudit = () => ['distribution_item_count_unknown']

export const isLegacyWebhookRegisterRetry = (post: DetectPost, resultJson: string | null): boolean => {
  if (post.extractionContext !== undefined || resultJson === null) return false
  try {
    const raw: unknown = JSON.parse(resultJson)
    if (typeof raw !== 'object' || raw === null || 'discovery' in raw || 'outcome' in raw) return false
    const result = DetectionResultSchema.safeParse(raw)
    return result.success && result.data.status === 'register'
  } catch {
    return false
  }
}

const explicitLegacyRetry = (envelope: unknown, context: LegacyRetry | undefined): boolean => {
  if (context === undefined || !isLegacyWebhookRegisterRetry(context.post, context.resultJson)) return false
  if (envelope === null) return true
  if (typeof envelope !== 'object' || !('version' in envelope) || 'contextVersion' in envelope) return false
  return LegacyExtractionVersionSchema.safeParse(envelope.version).success
}

/** 保存された件数の監査から確認理由を計算する。自動登録の関門としては使わなくなった（呼び出しは単体テストだけ）。 */
export const storedWebhookItemCountReviewReasons = (value: string | null, context?: LegacyRetry): string[] => {
  try {
    const envelope: unknown = value === null ? null : JSON.parse(value)
    if (value !== null && (typeof envelope !== 'object' || envelope === null)) return unknownAudit()
    if (typeof envelope === 'object' && envelope !== null && 'itemCountAudit' in envelope) {
      const parsed = ItemCountAuditSchema.safeParse(envelope.itemCountAudit)
      return parsed.success ? itemCountReviewReasons(parsed.data) : unknownAudit()
    }
    return explicitLegacyRetry(envelope, context) ? [] : unknownAudit()
  } catch {
    return unknownAudit()
  }
}
