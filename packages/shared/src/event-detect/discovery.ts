import { z } from 'zod'
import type { ClefResponse } from './clef'
import { filterWebhookPost } from './detection-context'
import { groundedDiscoveryEvidence, groundedDiscoveryProof } from './discovery-evidence'

export { groundedDiscoveryEvidence, groundedDiscoveryProof } from './discovery-evidence'

import type { DetectionResult } from './detection-schemas'
import { DEFAULT_DETECTION_THRESHOLDS, type DetectionThresholds, thresholdOf } from './detection-thresholds'
import { normalizeText } from './filter'
import type { DetectPost } from './post'

export const DetectionOutcomeSchema = z.object({
  discovery: z.object({
    status: z.enum(['detected', 'uncertain', 'not_event']),
    confidence: z.number().min(0).max(1).nullable(),
    evidence: z.array(z.string().nonempty())
  }),
  action: z.enum(['create', 'review', 'update', 'end', 'ignore']),
  missingFields: z.array(z.string().nonempty())
})
export type DetectionOutcome = z.infer<typeof DetectionOutcomeSchema>

const choice = (answers: ClefResponse['answers'] | null, key: string) => {
  const answer = answers === null ? undefined : answers[key]
  return answer?.type === 'choice' ? answer : undefined
}
const missingFieldNames: ReadonlyMap<string, string> = new Map([
  ['registration_not_evaluated', 'registrationAssessment'],
  ['status_unconfirmed', 'status'],
  ['category_unconfirmed', 'category'],
  ['distribution_item_unspecified', 'category'],
  ['store_unconfirmed', 'stores'],
  ['store_mismatch', 'stores'],
  ['character_unconfirmed', 'characterIds'],
  ['start_date_unconfirmed', 'startDate'],
  ['start_date_unspecified', 'startDate'],
  ['end_date_unconfirmed', 'endDate'],
  ['distribution_condition_unconfirmed', 'conditions'],
  ['distribution_condition_unspecified', 'conditions'],
  ['unmodeled_distribution_condition', 'conditions'],
  ['purchase_amount_unconfirmed', 'purchaseAmount'],
  ['charge_amount_unconfirmed', 'chargeAmount'],
  // 自動登録の精度のための保留規則（detection.ts の gateReasons）。足りない項目ではなく、人が確認する項目を指す。
  ['condition_pattern_unconfirmed', 'conditions'],
  ['charge_condition_unconfirmed', 'conditions'],
  ['extraction_store_unspecified', 'stores'],
  ['quantity_unconfirmed', 'limitedQuantity']
])

/** 発見と登録を別判定にし、raw確率を変更せず根拠・不足情報・実行可能actionを返す。 */
export const describeDetectionOutcome = (
  post: DetectPost,
  answers: ClefResponse['answers'] | null,
  decision: DetectionResult | null,
  thresholds: DetectionThresholds = DEFAULT_DETECTION_THRESHOLDS
): DetectionOutcome => {
  const filter = filterWebhookPost(post)
  const structural =
    filter.reason !== undefined && filter.reason !== 'no_keyword' && filter.reason !== 'excluded_keyword'
  const answer = answers === null ? undefined : answers.is_event
  const confidence = answer?.type === 'noul' ? answer.noul : null
  const grounded = groundedDiscoveryEvidence(post)
  const groundedConfirmed = groundedDiscoveryProof(post).some((proof) => proof.strength === 'explicit')
  const unrelatedContent =
    filter.reason === 'excluded_keyword' ||
    (filter.reason === 'no_keyword' && filter.excludeHits.length > 0 && filter.rescueHits.length === 0)
  const contentExcluded = unrelatedContent && !groundedConfirmed && decision?.status !== 'register'
  const evidence = [
    ...grounded,
    ...(confidence !== null && confidence >= thresholds.eventThreshold ? ['model_event_confirmed'] : []),
    ...(decision?.status === 'register' ? ['validated_registration_candidate'] : []),
    ...(structural ? [`excluded_source:${filter.reason}`] : []),
    ...(contentExcluded && !structural ? ['excluded_content:unrelated_promotion'] : [])
  ]
  // 店舗とビッカメ娘の両方が none で対象外になった判定（not_distribution_event）は、is_event の確率に関わらず not_event。
  // is_event は参考値なので、確率が高くてもこの判定を detected に戻さない。本文の明示的な根拠（groundedConfirmed）がある場合は従来どおり detected を優先する。
  const modelRejected = decision?.status === 'ignored' && decision.reasons.includes('not_distribution_event')
  const status =
    structural || contentExcluded
      ? 'not_event'
      : decision?.status === 'register' || groundedConfirmed
        ? 'detected'
        : modelRejected
          ? 'not_event'
          : confidence !== null && confidence >= thresholds.eventThreshold
            ? 'detected'
            : confidence !== null && confidence < thresholds.ignoreThreshold
              ? 'not_event'
              : 'uncertain'
  const statusAnswer = choice(answers, 'status')
  const stateConfirmed =
    statusAnswer !== undefined &&
    statusAnswer.probabilities[statusAnswer.choice] !== undefined &&
    statusAnswer.probabilities[statusAnswer.choice] >= thresholdOf(thresholds, 'status')
  const text = normalizeText(post.text)
  const ending = stateConfirmed
    ? statusAnswer.choice === 'end'
    : /(?:展示|展開|配布|配り|企画).{0,12}(?:終了|撤去|完配)|完売|配布終了/.test(text)
  const updating = stateConfirmed
    ? statusAnswer.choice === 'ongoing'
    : /残り|残数|まだあります|配布中|配布済|訂正|再投稿/.test(text)
  const action =
    status === 'not_event'
      ? 'ignore'
      : status !== 'detected'
        ? 'review'
        : ending
          ? 'end'
          : updating
            ? 'update'
            : decision?.status === 'register'
              ? 'create'
              : 'review'
  return {
    discovery: { status, confidence, evidence },
    action,
    missingFields: [
      ...new Set(
        (decision === null ? ['registration_not_evaluated'] : decision.reasons).flatMap((reason) => {
          const field = missingFieldNames.get(reason)
          return field === undefined ? [] : [field]
        })
      )
    ]
  }
}
