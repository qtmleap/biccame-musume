import { z } from 'zod'
import type { GoalPipelineModule } from './goal-pipeline-module'
import { GoalOutcomeSchema, type GoalPipelineResult } from './goal-pipeline-schema'

// 旧版で実際に到達した候補の応答を固定し、新しい発見ルールだけの寄与を診断する。実AI結果ではない。
export const applyGoalDiscoveryRules = (result: GoalPipelineResult, rules: GoalPipelineModule): GoalPipelineResult => {
  if (rules.describeDetectionOutcome === undefined || rules.groundedDiscoveryEvidence === undefined)
    throw new Error('Counterfactual requires explicit grounded discovery functions')
  const describe = rules.describeDetectionOutcome
  const ground = rules.groundedDiscoveryEvidence
  const judgements = result.judgements.map((judgement) => {
    const outcome = GoalOutcomeSchema.safeParse(
      describe(judgement.post, judgement.response.answers, judgement.decision)
    )
    const evidence = z.array(z.string().nonempty()).safeParse(ground(judgement.post))
    if (!outcome.success || !evidence.success) throw new Error('Invalid diagnostic discovery result')
    return { ...judgement, outcome: outcome.data, groundedEvidence: evidence.data }
  })
  return { ...result, judgements }
}
