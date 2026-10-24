import { type ClefRequest, ClefRequestSchema, type ClefResponse } from '@biccame/shared/event-detect/clef'
import {
  buildDetectionDraft,
  createDetectionRequests,
  DetectionResultSchema,
  type DetectionThresholds,
  evaluateDetection
} from '@biccame/shared/event-detect/detection'
import { auditItemCount, itemCountReviewReasons } from '@biccame/shared/event-detect/extraction'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import { type CandidateView, extractionStoreOf, viewOf } from './d1-gold-candidate'
import { allFieldsMatch, compareRegistered } from './d1-gold-compare'
import type { FixtureCandidate, FixtureCase } from './d1-gold-fixture-schema'
import { matchCandidates } from './d1-gold-match'
import { pinTopChoice } from './d1-gold-replay'
import type { GoalJudgement } from './goal-pipeline-schema'

// 判定の入力 1 件。フィクスチャでも、保存した元の結果でも、この形にそろえてから同じ関数で評価する。
export type JudgementSource = {
  item: string
  contextOnly: boolean
  storeKey: string | null
  post: DetectPost
  // 質問の全バッチを 1 つにまとめた request。
  request: ClefRequest
  requests: ClefRequest[]
  answers: ClefResponse['answers']
}

export const mergeRequests = (requests: readonly ClefRequest[]): ClefRequest => {
  const merged = ClefRequestSchema.safeParse({
    ...requests[0],
    questions: Object.fromEntries(requests.flatMap((request) => Object.entries(request.questions)))
  })
  if (!merged.success) throw new Error('Invalid merged detection request')
  return merged.data
}

// 質問は現行のソースが投稿と店舗ヒントから作る。保存した質問とは、フィクスチャの作成時に一致を確かめている。
const sourceOf = (
  post: DetectPost,
  candidate: { item: string; contextOnly: boolean; storeKey: string | null; answers: ClefResponse['answers'] }
): JudgementSource => {
  const requests = createDetectionRequests(post, 'clef', candidate.storeKey)
  return {
    item: candidate.item,
    contextOnly: candidate.contextOnly,
    storeKey: candidate.storeKey,
    post,
    request: mergeRequests(requests),
    requests,
    answers: candidate.answers
  }
}

// フィクスチャの候補を判定の入力にする。元の投稿の本文は案件ごとに 1 回だけ持っているので、ここで戻す。
export const sourceOfFixture = (fixtureCase: FixtureCase, candidate: FixtureCandidate): JudgementSource => {
  const { extractionContext, ...rest } = candidate.post
  const post: DetectPost =
    extractionContext === undefined
      ? rest
      : { ...rest, extractionContext: { ...extractionContext, originalText: fixtureCase.originalText } }
  return sourceOf(post, candidate)
}

// 保存した元の結果（確率を切り詰める前）を判定の入力にする。質問は保存したものをそのまま使う。
export const sourceOfSaved = (judgement: GoalJudgement): JudgementSource => ({
  item: judgement.item,
  contextOnly: judgement.contextOnly,
  storeKey: extractionStoreOf(judgement.requests[0].state),
  post: judgement.post,
  request: mergeRequests(judgement.requests),
  requests: judgement.requests,
  answers: judgement.response.answers
})

export type EvaluateOptions = {
  thresholds: DetectionThresholds
  // 店舗とビッカメ娘の最上位を確率 1.0 にして評価する（しきい値に依らず最上位をそのまま採用した場合）。
  pinTop: boolean
  // 評価関数。既定は現行のソース。凍結版を比べるときだけ差し替える。
  evaluator?: (
    post: DetectPost,
    request: ClefRequest,
    response: ClefResponse,
    thresholds: DetectionThresholds,
    storeKey: string | null
  ) => unknown
}

export type CandidateOutcome = {
  caseId: string
  contextOnly: boolean
  status: 'register' | 'held' | 'ignored'
  reasons: string[]
  // 登録になった候補の保存値（canonical 比較用）。
  candidate: unknown
  matchedGold: string | null
  // 登録になり、対応づいた正解と全項目が一致したか（終了日は strict。既定）。
  exact: boolean
  // 同じく、終了日を announce-time（R1: 候補に終了日が無ければ一致）で比べたとき。
  exactAnnounceTime: boolean
}

const evaluate = (source: JudgementSource, options: EvaluateOptions) => {
  const store = pinTopChoice(source.answers.store)
  const character = pinTopChoice(source.answers.character)
  const answers: ClefResponse['answers'] = options.pinTop
    ? {
        ...source.answers,
        ...(store === undefined ? {} : { store }),
        ...(character === undefined ? {} : { character })
      }
    : source.answers
  const evaluator = options.evaluator === undefined ? evaluateDetection : options.evaluator
  const decision = DetectionResultSchema.safeParse(
    evaluator(source.post, source.request, { answers }, options.thresholds, source.storeKey)
  )
  if (!decision.success) throw new Error('Invalid evaluated decision')
  return decision.data
}

// 1 案件の全候補を評価し、正解と突き合わせる。突き合わせは保存した応答の最上位で決め、評価の設定に依らない。
export const evaluateSources = (
  caseId: string,
  golds: FixtureCase['golds'],
  sources: readonly JudgementSource[],
  options: EvaluateOptions
): CandidateOutcome[] => {
  const saved = sources.map((source) => evaluate(source, { ...options, pinTop: false }))
  const judgements = sources.map(
    (source, index): GoalJudgement => ({
      item: source.item,
      post: source.post,
      requests: source.requests,
      response: { answers: source.answers },
      decision: saved[index],
      draft: { ...buildDetectionDraft(source.post, source.answers) },
      outcome: null,
      groundedEvidence: [],
      contextOnly: source.contextOnly
    })
  )
  const views: CandidateView[] = judgements.map(viewOf)
  const matching = matchCandidates(views, golds)
  return sources.map((source, index) => {
    const decision = options.pinTop ? evaluate(source, options) : saved[index]
    const match = matching.matches.find((item) => item.candidate === index)
    const gold = match === undefined ? undefined : golds.find((event) => event.uuid === match.gold)
    const fields =
      decision.status === 'register' && gold !== undefined ? compareRegistered(decision.candidate, gold) : null
    return {
      caseId,
      contextOnly: source.contextOnly,
      status: decision.status,
      reasons: decision.reasons,
      candidate: decision.status === 'register' ? decision.candidate : null,
      matchedGold: match === undefined ? null : match.gold,
      exact: fields !== null && allFieldsMatch(fields),
      exactAnnounceTime: fields !== null && allFieldsMatch(fields, 'announce-time')
    }
  })
}

// 件数の監査の保留理由。保存した抽出の物品名と件数質問の応答から、しきい値を変えて計算し直す。
export const auditReasonsOf = (fixtureCase: FixtureCase, threshold: number): string[] =>
  fixtureCase.count === null
    ? []
    : itemCountReviewReasons(
        auditItemCount(
          fixtureCase.items.map((item) => ({ item })),
          { answers: { distribution_item_count: fixtureCase.count } },
          threshold
        )
      )

export type FixtureEvaluation = {
  caseId: string
  completed: boolean
  goldEvents: number
  auditReasons: string[]
  outcomes: CandidateOutcome[]
}

export const evaluateFixtureCases = (
  cases: readonly FixtureCase[],
  options: EvaluateOptions,
  auditThreshold: number
): FixtureEvaluation[] =>
  cases.map((fixtureCase) => ({
    caseId: fixtureCase.caseId,
    completed: fixtureCase.completed,
    goldEvents: fixtureCase.golds.length,
    auditReasons: auditReasonsOf(fixtureCase, auditThreshold),
    outcomes: evaluateSources(
      fixtureCase.caseId,
      fixtureCase.golds,
      fixtureCase.candidates.map((candidate) => sourceOfFixture(fixtureCase, candidate)),
      options
    )
  }))

export type Policy = 'raw' | 'production'
// 登録の質。終了日は R1 を主指標、strict を参考として両方返す。raw は評価の結果そのまま（文脈候補・件数の監査も含む）、production は本番と同じく文脈候補と件数の監査で保留の候補を除く。
export const summarize = (evaluations: readonly FixtureEvaluation[], policy: Policy) => {
  const registered = evaluations.flatMap((evaluation) =>
    evaluation.outcomes.filter(
      (outcome) =>
        outcome.status === 'register' &&
        (policy === 'raw' || (!outcome.contextOnly && evaluation.auditReasons.length === 0))
    )
  )
  const exact = registered.filter((outcome) => outcome.exact).length
  const exactAnnounceTime = registered.filter((outcome) => outcome.exactAnnounceTime).length
  const goldEvents = evaluations.reduce((sum, evaluation) => sum + evaluation.goldEvents, 0)
  const precisionOf = (n: number) => (registered.length === 0 ? null : n / registered.length)
  const exactRateOf = (n: number) => (goldEvents === 0 ? null : n / goldEvents)
  return {
    posts: evaluations.length,
    goldEvents,
    registered: registered.length,
    // strict（終了日の完全一致。参考）。
    exact,
    precision: precisionOf(exact),
    exactRate: exactRateOf(exact),
    // R1（announce-time: 候補に終了日が無ければ一致。主指標）。登録の可否は同じで、終了日の一致だけが違う。
    announceTime: {
      exact: exactAnnounceTime,
      precision: precisionOf(exactAnnounceTime),
      exactRate: exactRateOf(exactAnnounceTime)
    }
  }
}
