import { GoalAnnotatedCaseSchema } from './goal-pipeline-goal-corpus'
import type { GoalPipelineResult } from './goal-pipeline-schema'

// 物品名の言い換えを正誤と決めず、注釈済み原文spanが候補へ保持されたかを別採点する。
export const scoreGoalStages = (sample: unknown, result: GoalPipelineResult) => {
  const parsed = GoalAnnotatedCaseSchema.safeParse(sample)
  if (!parsed.success) return null
  const gold = parsed.data.stageGold
  const items = gold.items.map((item) => {
    const extracted = result.extraction.events.filter((event) =>
      item.evidence.every((span) => event.evidence.some((text) => text.includes(span)))
    )
    const judged = result.judgements.filter((judgement) => extracted.some((event) => event.item === judgement.item))
    return {
      item: item.item,
      evidence: item.evidence,
      extracted: extracted.length > 0,
      judged: judged.length > 0,
      actions: judged.flatMap((judgement) => (judgement.outcome === null ? [] : [judgement.outcome.action]))
    }
  })
  const expectedAction =
    gold.action === 'new'
      ? 'create'
      : gold.action === 'update'
        ? 'update'
        : gold.action === 'end'
          ? 'end'
          : gold.action === 'not_event'
            ? 'ignore'
            : 'review'
  const actions = result.judgements.flatMap((judgement) =>
    judgement.outcome === null ? [] : [judgement.outcome.action]
  )
  return {
    provenance: 'provisional-source-annotations-not-human-gold',
    scope: 'diagnostic-only-stage-boundary-ambiguities-not-quality-gate',
    semanticStageAccuracyScored: false,
    itemMetric: 'annotated-exact-span-retention-not-semantic-item-equivalence',
    expectedAction,
    actionAvailable: actions.length > 0,
    actionMatched: actions.includes(expectedAction),
    items,
    annotatedItems: items.length,
    extractedItems: items.filter((item) => item.extracted).length,
    judgedItems: items.filter((item) => item.judged).length,
    registrationGold: gold.registration,
    unannotatedFields: gold.unannotatedFields
  }
}
