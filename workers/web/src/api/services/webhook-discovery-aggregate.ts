import type { WebhookDiscovery } from '@biccame/shared/schemas/webhook.dto'

/** 子候補の保存済み根拠を集約する。未判定の子を陰性とみなしたり、登録を自動許可したりしない。 */
export const aggregateWebhookDiscovery = (
  parent: WebhookDiscovery | null | undefined,
  children: readonly { discovery?: WebhookDiscovery | null }[]
): WebhookDiscovery | null => {
  const known = children.flatMap((child) =>
    child.discovery === undefined || child.discovery === null ? [] : [child.discovery]
  )
  if (known.length === 0) return parent === undefined ? null : parent
  const detected = known.filter((discovery) => discovery.relevance === 'detected')
  const relevant = detected.length > 0 ? detected : known.filter((discovery) => discovery.relevance === 'uncertain')
  const selected = relevant.length > 0 ? relevant : known
  const actions = [...new Set(selected.map((discovery) => discovery.action))]
  const allJudged = known.length === children.length
  const relevance = detected.length > 0 ? 'detected' : relevant.length > 0 || !allJudged ? 'uncertain' : 'not_detected'
  const action = relevance === 'not_detected' ? 'none' : actions.length === 1 && allJudged ? actions[0] : 'review'
  const probabilities = selected.flatMap((discovery) => (discovery.confidence === null ? [] : [discovery.confidence]))
  return {
    relevance,
    action: action === undefined ? 'review' : action,
    confidence: probabilities.length === 0 ? null : Math.max(...probabilities),
    evidence: [...new Set(selected.flatMap((discovery) => discovery.evidence))],
    missingFields: [...new Set(selected.flatMap((discovery) => discovery.missingFields))],
    reasons: [...new Set(selected.flatMap((discovery) => discovery.reasons))]
  }
}
