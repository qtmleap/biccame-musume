import type { DetectionResult } from '@biccame/shared/event-detect/detection'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import type { EventRequest } from '@biccame/shared/schemas/event.dto'
import type { WebhookDiscovery } from '@biccame/shared/schemas/webhook.dto'

/** 発見の確定だけでは登録しない。配布物ゼロの企画文脈・更新・不足情報を自動登録へ昇格させない。 */
export const canAutoRegisterWebhookCandidate = (
  post: DetectPost,
  result: DetectionResult,
  candidate: EventRequest | null,
  discovery: WebhookDiscovery | null
): boolean => {
  if (post.extractionContext?.kind === 'event' || result.status !== 'register' || candidate === null) return false
  // 旧形式で明示的なregisterと完全な候補が保存済みの場合だけ、既存の再試行契約を維持する。
  if (discovery === null) return true
  return discovery.relevance === 'detected' && discovery.action === 'create' && discovery.missingFields.length === 0
}
