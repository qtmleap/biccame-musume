import type { BenchmarkCase } from './benchmark-schema'
import type { scoreBenchmarkDecision } from './benchmark-score'

export type BenchmarkScore = ReturnType<typeof scoreBenchmarkDecision>
export type BenchmarkCaseResult = {
  id: string
  calls: number
  score: BenchmarkScore | null
  error: string | null
}
const ratio = (numerator: number, denominator: number) => (denominator === 0 ? null : numerator / denominator)

// エラーと保留を分母から除かず、注釈がない項目だけを採点対象から外す。
export const summarizeBenchmarkCohort = (cases: BenchmarkCase[], results: BenchmarkCaseResult[]) => {
  const scored = cases.map((sample) => ({ sample, result: results.find((result) => result.id === sample.id) }))
  const positives = scored.filter(({ sample }) => sample.expected.isEvent)
  const negatives = scored.filter(({ sample }) => !sample.expected.isEvent)
  const tp = positives.filter(({ result }) => result?.score?.eventPrediction === true).length
  const tn = negatives.filter(({ result }) => result?.score?.eventPrediction === false).length
  const fp = negatives.filter(({ result }) => result?.score?.eventPrediction === true).length
  const fn = positives.length - tp
  const abstained = scored.filter(
    ({ result }) => result?.score?.eventPrediction === null || result?.score === undefined || result?.score === null
  ).length
  const precision = ratio(tp, tp + fp)
  const recall = ratio(tp, positives.length)
  const specificity = ratio(tn, negatives.length)
  const keys = ['status', 'category', 'stores', 'characterIds', 'startDate', 'conditions'] as const
  const fields = Object.fromEntries(
    keys.map((key) => {
      const annotated = scored.filter(({ sample }) => sample.expected[key] !== null)
      const correct = annotated.filter(({ result }) => result?.score?.checks[key] === true).length
      const byRelevance = (positive: boolean) => {
        const subset = annotated.filter(({ sample }) => sample.expected.isEvent === positive)
        const matched = subset.filter(({ result }) => result?.score?.checks[key] === true).length
        return { annotated: subset.length, correct: matched, accuracy: ratio(matched, subset.length) }
      }
      return [
        key,
        {
          annotated: annotated.length,
          correct,
          accuracy: ratio(correct, annotated.length),
          eventPositive: byRelevance(true),
          eventNegative: byRelevance(false)
        }
      ]
    })
  )
  const tags = [...new Set(cases.flatMap((sample) => sample.tags))].sort()
  const strata = Object.fromEntries(
    tags.map((tag) => {
      const rows = scored.filter(({ sample }) => sample.tags.includes(tag))
      const correct = rows.filter(({ result }) => result?.score?.checks.isEvent === true).length
      return [tag, { total: rows.length, correct, accuracy: ratio(correct, rows.length) }]
    })
  )
  return {
    total: cases.length,
    completed: results.filter((result) => result.score !== null).length,
    errors: results.filter((result) => result.error !== null).length,
    missing: cases.filter((sample) => !results.some((result) => result.id === sample.id)).length,
    calls: results.reduce((sum, result) => sum + result.calls, 0),
    event: {
      positive: positives.length,
      negative: negatives.length,
      tp,
      fp,
      fn,
      tn,
      negativeAbstentions: negatives.filter(
        ({ result }) => result?.score?.eventPrediction !== true && result?.score?.eventPrediction !== false
      ).length,
      abstained,
      precision,
      recall,
      specificity,
      accuracy: ratio(tp + tn, cases.length),
      coverage: ratio(cases.length - abstained, cases.length),
      balancedAccuracy: recall === null || specificity === null ? null : (recall + specificity) / 2,
      f1:
        precision === null || recall === null || precision + recall === 0
          ? null
          : (2 * precision * recall) / (precision + recall),
      majorityClassBaseline: ratio(Math.max(positives.length, negatives.length), cases.length)
    },
    pipeline: {
      registered: results.filter((result) => result.score?.decision.status === 'register').length,
      held: results.filter((result) => result.score?.decision.status === 'held').length,
      ignored: results.filter((result) => result.score?.decision.status === 'ignored').length,
      allAnnotatedFieldsCorrect: results.filter((result) => result.score?.passed === true).length
    },
    fields,
    strata,
    annotationStatus: 'provisional-not-human-reviewed'
  }
}
