import type { BenchmarkCase } from './benchmark-schema'
import type { GoalPipelineResult, GoalJudgement } from './goal-pipeline-schema'
import { observeGoalOperator, type GoalProofReader } from './goal-pipeline-operator'
import { scoreGoalStages } from './goal-pipeline-stages'

const recordedDiscovery = (judgement: GoalJudgement) => {
  const discovery = judgement.outcome?.discovery
  if (discovery === undefined || discovery.status !== 'detected' || discovery.evidence.length === 0) return false
  const answer = judgement.response.answers.is_event
  const modelConfirmed = answer?.type === 'noul' && answer.noul >= 0.9
  return discovery.evidence.every(
    (code) => judgement.groundedEvidence.includes(code) || (code === 'model_event_confirmed' && modelConfirmed)
  )
}

// 旧版でも高確度の関連性を認識済みならheldを未検出と数えず、登録の成否とは分ける。
export const scoreGoalPipeline = (
  sample: BenchmarkCase,
  result: GoalPipelineResult,
  readProof: GoalProofReader | null = null
) => {
  const observed = result.judgements.map((judgement) => {
    const answer = judgement.response.answers.is_event
    const rawProbability = answer?.type === 'noul' ? answer.noul : null
    const modelDetected = rawProbability !== null && rawProbability >= 0.9 && judgement.decision.status !== 'ignored'
    return {
      item: judgement.item,
      rawProbability,
      modelDetected,
      groundedDiscovery: recordedDiscovery(judgement),
      action: judgement.outcome === null ? null : judgement.outcome.action,
      evidence: judgement.outcome === null ? [] : judgement.outcome.discovery.evidence,
      missingFields: judgement.outcome === null ? [] : judgement.outcome.missingFields,
      contextOnly: judgement.contextOnly,
      decision: judgement.decision.status,
      reasons: judgement.decision.reasons
    }
  })
  const rawModelDetected = observed.some((item) => item.rawProbability !== null && item.rawProbability >= 0.9)
  const productionDetected = observed.some((item) => item.modelDetected || item.groundedDiscovery)
  const operator = readProof === null ? null : observeGoalOperator(result, readProof)
  const detected = productionDetected
  const uncertain =
    !detected && (result.stopped || observed.some((item) => item.rawProbability !== null && item.rawProbability >= 0.5))
  const outcome = detected ? 'detected' : uncertain ? 'review' : 'unrelated'
  const gold = sample.expected.isEvent
  return {
    id: sample.id,
    postId: sample.post.id,
    metricScope: 'production-policy-relevance-not-operator-visibility',
    gold,
    outcome,
    truePositive: gold && detected,
    falsePositive: !gold && detected,
    falseNegative: gold && outcome === 'unrelated',
    trueNegative: !gold && outcome === 'unrelated',
    positiveAbstention: gold && uncertain,
    negativeAbstention: !gold && uncertain,
    positiveMiss: gold && !detected,
    observed,
    operator,
    productionDetected,
    rawModelDetected,
    layers: {
      rawModel: rawModelDetected,
      productionPolicy: productionDetected,
      operatorVisible: operator === null ? null : operator.detected,
      operatorRelationConfirmed: operator === null ? null : operator.candidates.some((item) => item.relationConfirmed)
    },
    stages: scoreGoalStages(sample, result),
    extractionItems: result.extraction.events.map((item) => item.item),
    countAudit: result.audit,
    stopReasons: result.stopReasons,
    registrationReady:
      result.audit.status === 'matched' && observed.some((item) => item.decision === 'register' && !item.contextOnly)
  }
}
export type GoalPipelineScore = ReturnType<typeof scoreGoalPipeline>
export const summarizeGoalPipelines = (scores: GoalPipelineScore[]) => {
  const count = (
    field:
      | 'truePositive'
      | 'falsePositive'
      | 'falseNegative'
      | 'trueNegative'
      | 'positiveAbstention'
      | 'negativeAbstention'
  ) => scores.filter((score) => score[field]).length
  const positive = scores.filter((score) => score.gold).length
  const negative = scores.length - positive
  return {
    total: scores.length,
    positive,
    negative,
    TP: count('truePositive'),
    FP: count('falsePositive'),
    FN: count('falseNegative'),
    TN: count('trueNegative'),
    positiveAbstention: count('positiveAbstention'),
    negativeAbstention: count('negativeAbstention'),
    recall: positive === 0 ? null : count('truePositive') / positive,
    falsePositiveRate: negative === 0 ? null : count('falsePositive') / negative,
    judgedCases: scores.filter((score) => score.observed.length > 0).length,
    rawModelTP: scores.filter(
      (score) => score.gold && score.observed.some((item) => item.rawProbability !== null && item.rawProbability >= 0.9)
    ).length,
    rawModelFP: scores.filter(
      (score) =>
        !score.gold && score.observed.some((item) => item.rawProbability !== null && item.rawProbability >= 0.9)
    ).length,
    rawModelPositive: scores.filter((score) =>
      score.observed.some((item) => item.rawProbability !== null && item.rawProbability >= 0.9)
    ).length,
    modelDetected: scores.filter((score) => score.observed.some((item) => item.modelDetected)).length,
    groundedRuleOnlyDetected: scores.filter(
      (score) => score.outcome === 'detected' && !score.observed.some((item) => item.modelDetected)
    ).length,
    actionCounts: Object.fromEntries(
      ['create', 'review', 'update', 'end', 'ignore'].map((action) => [
        action,
        scores.filter((score) => score.observed.some((item) => item.action === action)).length
      ])
    ),
    registeredReady: scores.filter((score) => score.registrationReady).length,
    stageMetrics: {
      scope: 'diagnostic-only-not-stage-accuracy-or-quality-gate',
      annotatedCases: scores.filter((score) => score.stages !== null).length,
      annotatedItems: scores.reduce((sum, score) => sum + (score.stages === null ? 0 : score.stages.annotatedItems), 0),
      exactSpanExtractedItems: scores.reduce(
        (sum, score) => sum + (score.stages === null ? 0 : score.stages.extractedItems),
        0
      ),
      exactSpanJudgedItems: scores.reduce(
        (sum, score) => sum + (score.stages === null ? 0 : score.stages.judgedItems),
        0
      ),
      nativeActionAvailable: scores.filter((score) => score.stages !== null && score.stages.actionAvailable).length,
      nativeActionMatched: scores.filter((score) => score.stages !== null && score.stages.actionMatched).length,
      nativeActionUnavailable: scores.filter((score) => score.stages !== null && !score.stages.actionAvailable).length
    },
    layerMetrics: Object.fromEntries(
      (['rawModel', 'productionPolicy', 'operatorVisible', 'operatorRelationConfirmed'] as const).map((layer) => {
        const known = scores.filter((score) => score.layers[layer] !== null)
        const TP = known.filter((score) => score.gold && score.layers[layer]).length
        return [
          layer,
          {
            TP,
            FP: known.filter((score) => !score.gold && score.layers[layer]).length,
            positiveMisses: known.filter((score) => score.gold && !score.layers[layer]).length,
            negativeMisses: known.filter((score) => !score.gold && !score.layers[layer]).length,
            effectiveRecall: positive === 0 ? null : TP / positive,
            unavailable: scores.length - known.length
          }
        ]
      })
    )
  }
}
