import type { Bindings } from '@api/types/bindings'
import type { ClefResponse } from '@biccame/shared/event-detect/clef'
import {
  type DetectionResult,
  type DetectionThresholds,
  describeDetectionOutcome
} from '@biccame/shared/event-detect/detection'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import { type WebhookDiscovery, WebhookDiscoverySchema, type WebhookJob } from '@biccame/shared/schemas/webhook.dto'
import type { WebhookTarget } from './webhook-job-record'

/** 原回答・明示根拠・登録判定を別のまま記録する。発見済みを自動登録済みとは扱わない。 */
export const recordWebhookDiscovery = (
  post: DetectPost,
  answers: ClefResponse['answers'] | null,
  decision: DetectionResult | null,
  thresholds?: DetectionThresholds
): WebhookDiscovery => {
  const outcome = describeDetectionOutcome(post, answers, decision, thresholds)
  return {
    relevance: outcome.discovery.status === 'not_event' ? 'not_detected' : outcome.discovery.status,
    action: outcome.action === 'ignore' ? 'none' : outcome.action,
    confidence: outcome.discovery.confidence,
    evidence: outcome.discovery.evidence,
    missingFields: [
      ...new Set([
        ...outcome.missingFields,
        ...(decision === null ? ['status', 'category', 'stores', 'characterIds', 'startDate', 'conditions'] : [])
      ])
    ],
    reasons: [...new Set(decision === null ? [] : decision.reasons)]
  }
}

/** 重複・人手確認など後段の登録理由を反映し、実行可能なactionと食い違わせない。 */
export const synchronizeWebhookDiscovery = async (
  env: Pick<Bindings, 'DB'>,
  job: WebhookJob,
  target: WebhookTarget,
  token: string
): Promise<WebhookJob> => {
  const current = job.discovery
  if (current === undefined || current === null) return job
  const discovery: WebhookDiscovery = {
    ...current,
    action:
      job.status === 'ignored' && job.reasons.includes('manually_rejected')
        ? 'none'
        : job.status === 'held' && current.action === 'create'
          ? 'review'
          : current.action,
    missingFields: [...new Set(current.missingFields)],
    reasons: [...new Set(job.reasons)]
  }
  const changed = await env.DB.prepare(
    `UPDATE ${target.table} SET result_json=json_set(result_json,'$.discovery',json(?))
      WHERE ${target.column}=? AND lease_token=? AND json_valid(result_json)`
  )
    .bind(JSON.stringify(discovery), target.id, token)
    .run()
  if (changed.meta.changes !== 1) throw new Error('Webhook discovery lease lost')
  return { ...job, discovery }
}

/** 保存時の発見判定だけを読む。旧版や破損した履歴から現在の判定を捏造しない。 */
export const storedWebhookDiscovery = (value: string | null | undefined) => {
  if (value === undefined || value === null) return null
  try {
    const envelope: unknown = JSON.parse(value)
    const parsed = WebhookDiscoverySchema.safeParse(
      typeof envelope === 'object' && envelope !== null && 'discovery' in envelope ? envelope.discovery : undefined
    )
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
