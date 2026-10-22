import type { ClefResponse } from '@biccame/shared/event-detect/clef'
import {
  DEFAULT_DETECTION_THRESHOLDS,
  type DetectionDraft,
  type DetectionResult
} from '@biccame/shared/event-detect/detection'
import type { BenchmarkCase } from './benchmark-cases'

type Condition = { type: string; purchaseAmount?: number; chargeAmount?: number; quantity?: number }
const sameSet = (a: readonly string[], b: readonly string[]) =>
  JSON.stringify([...new Set(a)].sort()) === JSON.stringify([...new Set(b)].sort())
const conditionKey = (condition: Condition) =>
  JSON.stringify([
    condition.type,
    condition.type === 'charge' ? condition.chargeAmount : condition.purchaseAmount,
    condition.quantity
  ])

// イベント判定の保留を陰性と見なさず、物品など別項目の保留とも区別する。
export const benchmarkEventPrediction = (decision: DetectionResult, response?: ClefResponse): boolean | null => {
  const answer = response?.answers.is_event
  const probability = answer?.type === 'noul' ? answer.noul : decision.confidence
  if (probability >= DEFAULT_DETECTION_THRESHOLDS.eventThreshold) return true
  if (probability < DEFAULT_DETECTION_THRESHOLDS.ignoreThreshold) return false
  return null
}

export const scoreBenchmarkDecision = (
  sample: BenchmarkCase,
  decision: DetectionResult,
  draft?: DetectionDraft,
  response?: ClefResponse
) => {
  const expected = sample.expected
  const registered = decision.status === 'ignored' ? undefined : decision.candidate
  const candidate = registered === undefined ? draft : registered
  const eventPrediction = benchmarkEventPrediction(decision, response)
  const checks = {
    ...(expected.status === undefined || expected.status === null
      ? {}
      : { status: decision.status === expected.status }),
    ...(expected.isEvent === undefined ? {} : { isEvent: eventPrediction === expected.isEvent }),
    ...(expected.status === 'ignored'
      ? {}
      : {
          ...(expected.category === undefined || expected.category === null
            ? {}
            : { category: candidate?.category === expected.category }),
          ...(expected.stores === undefined || expected.stores === null
            ? {}
            : { stores: candidate !== undefined && sameSet(candidate.stores, expected.stores) }),
          ...(expected.characterIds === undefined || expected.characterIds === null
            ? {}
            : { characterIds: candidate !== undefined && sameSet(candidate.characterIds, expected.characterIds) }),
          ...(expected.startDate === undefined || expected.startDate === null
            ? {}
            : { startDate: candidate?.startDate === expected.startDate }),
          ...(expected.conditions === undefined || expected.conditions === null
            ? {}
            : {
                conditions:
                  candidate !== undefined &&
                  sameSet(
                    candidate.conditions.map(conditionKey),
                    expected.conditions.map((condition) =>
                      conditionKey({
                        type: condition.type,
                        ...(condition.amount === undefined
                          ? {}
                          : condition.type === 'charge'
                            ? { chargeAmount: condition.amount }
                            : { purchaseAmount: condition.amount }),
                        ...(condition.quantity === undefined ? {} : { quantity: condition.quantity })
                      })
                    )
                  )
              })
        })
  }
  return {
    id: sample.id,
    observationSource: registered !== undefined ? 'candidate' : draft === undefined ? 'none' : 'draft',
    passed: Object.keys(checks).length > 0 && Object.values(checks).every(Boolean),
    checks,
    eventPrediction,
    pipelinePrediction: decision.status === 'held' ? null : decision.status === 'register',
    decision,
    expected
  }
}

export const benchmarkSignals = (response: ClefResponse) =>
  Object.fromEntries(
    Object.entries(response.answers).flatMap(([key, answer]) => {
      if (answer.type === 'noul')
        return [[key, { answer: answer.noul >= 0.5 ? 'yes' : 'no', probability: answer.noul }]]
      if (answer.type === 'choice')
        return [[key, { answer: answer.choice, probability: answer.probabilities[answer.choice] }]]
      return []
    })
  )

export const summarizeBenchmark = (results: ReturnType<typeof scoreBenchmarkDecision>[]) => ({
  total: results.length,
  passed: results.filter((result) => result.passed).length,
  failed: results.filter((result) => !result.passed).length,
  accuracy: results.length === 0 ? null : results.filter((result) => result.passed).length / results.length
})
