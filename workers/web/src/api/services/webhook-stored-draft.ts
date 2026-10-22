import type { ClefResponse } from '@biccame/shared/event-detect/clef'
import { buildDetectionDraft } from '@biccame/shared/event-detect/detection'
import type { DetectPost } from '@biccame/shared/event-detect/post'

/** 保存境界で壊れた旧店舗回答を除き、新判定や対象ビッカメ娘を補完しない。 */
export const storedWebhookDraft = (post: DetectPost, answers: ClefResponse['answers']) => {
  if (Object.keys(answers).some((key) => key.startsWith('venue.'))) return buildDetectionDraft(post, answers)
  const answer = answers.store
  if (answer?.type !== 'choice') return buildDetectionDraft(post, answers)
  const probability = answer.probabilities[answer.choice]
  const valid = probability !== undefined && !Object.values(answer.probabilities).some((value) => value > probability)
  return buildDetectionDraft(
    post,
    valid ? answers : Object.fromEntries(Object.entries(answers).filter(([key]) => key !== 'store'))
  )
}
