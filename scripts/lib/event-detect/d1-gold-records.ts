import { ItemCountAuditSchema, itemCountReviewReasons } from '@biccame/shared/event-detect/extraction'
import { type CandidateView, viewOf } from './d1-gold-candidate'
import { compareArgmax, compareRegistered, type FieldMatches } from './d1-gold-compare'
import { type MatchBasis, matchCandidates } from './d1-gold-match'
import { replayDecision } from './d1-gold-replay'
import type { GoldCase } from './d1-gold-schema'
import type { GoalPipelineModule } from './goal-pipeline-module'
import type { GoalPipelineResult } from './goal-pipeline-schema'

export const SPECIAL_CHOICES: readonly string[] = ['none', 'multiple', 'other', 'secret']

export type Outcome = {
  status: 'register' | 'held' | 'ignored'
  reasons: string[]
  // 登録になったときだけ、対応づいた正解との全項目比較（対応が無ければ null）。
  fields: FieldMatches | null
}
export type CandidateRecord = {
  caseId: string
  index: number
  contextOnly: boolean
  extractionStore: string | null
  matchedGold: string | null
  basis: MatchBasis | null
  judgedStoreContributed: boolean
  view: CandidateView
  // 最上位の予測を正解と比べた結果（対応づいた候補だけ）。
  argmax: FieldMatches | null
  // 現行しきい値の判定、および店舗・娘を最上位でそのまま採用した再評価。
  current: Outcome
  topOne: Outcome
  // 本番と同じ件数監査の保留を重ねた状態。監査が matched 以外なら register は held（distribution_item_count_*）になる。
  currentGated: Outcome
  topOneGated: Outcome
  characterMass: { special: number; nonSpecial: number; sameAsTopStore: number } | null
}
export type GoldRecord = {
  caseId: string
  uuid: string
  postCompleted: boolean
  captured: boolean
  basis: MatchBasis | null
  explicitCharacter: boolean
}
export type CaseRecord = {
  caseId: string
  postId: string
  completed: boolean
  calls: number
  auditStatus: string | null
  auditReasons: string[]
  stopped: boolean
  extractedItems: number
  golds: GoldRecord[]
  candidates: CandidateRecord[]
  unmatchedCandidates: number
}

const characterMass = (view: CandidateView) => {
  if (view.character === null) return null
  const entries = Object.entries(view.character.probabilities)
  const special = entries
    .filter(([key]) => SPECIAL_CHOICES.includes(key))
    .reduce((sum, [, probability]) => sum + probability, 0)
  const total = entries.reduce((sum, [, probability]) => sum + probability, 0)
  const sameKey = view.store === null ? undefined : view.character.probabilities[view.store.choice]
  return { special, nonSpecial: total - special, sameAsTopStore: sameKey === undefined ? 0 : sameKey }
}

// 1投稿ぶんの保存結果を、候補ごと・正解ごとの記録へ展開する。AIは呼ばない。
export const buildCaseRecord = (
  module: GoalPipelineModule,
  sample: GoldCase,
  result: GoalPipelineResult | null
): CaseRecord => {
  const emptyGolds = (completed: boolean): GoldRecord[] =>
    sample.events.map((event) => ({
      caseId: sample.caseId,
      uuid: event.uuid,
      postCompleted: completed,
      captured: false,
      basis: null,
      explicitCharacter: event.characterIds.length > 0
    }))
  if (result === null)
    return {
      caseId: sample.caseId,
      postId: sample.postId,
      completed: false,
      calls: 0,
      auditStatus: null,
      auditReasons: [],
      stopped: false,
      extractedItems: 0,
      golds: emptyGolds(false),
      candidates: [],
      unmatchedCandidates: 0
    }
  const audit = ItemCountAuditSchema.safeParse(result.audit)
  if (!audit.success) throw new Error('Invalid saved item count audit')
  const auditReasons = itemCountReviewReasons(audit.data)
  const gate = (outcome: Outcome): Outcome =>
    outcome.status === 'register' && auditReasons.length > 0
      ? { status: 'held', reasons: auditReasons, fields: null }
      : outcome
  const views = result.judgements.map(viewOf)
  const matching = matchCandidates(views, sample.events)
  const goldOf = (uuid: string) => sample.events.find((event) => event.uuid === uuid)
  const candidates = result.judgements.map((judgement, index): CandidateRecord => {
    const view = views[index]
    const match = matching.matches.find((item) => item.candidate === index)
    const gold = match === undefined ? undefined : goldOf(match.gold)
    const outcomeOf = (mode: 'saved' | 'top-one'): Outcome => {
      const replay = replayDecision(module, judgement, mode)
      return {
        status: replay.status,
        reasons: replay.reasons,
        fields:
          replay.status === 'register' && replay.candidate !== null && gold !== undefined
            ? compareRegistered(replay.candidate, gold)
            : null
      }
    }
    const current = outcomeOf('saved')
    const topOne = outcomeOf('top-one')
    return {
      caseId: sample.caseId,
      index,
      contextOnly: view.contextOnly,
      extractionStore: view.extractionStore,
      matchedGold: match === undefined ? null : match.gold,
      basis: match === undefined ? null : match.basis,
      judgedStoreContributed: match === undefined ? false : match.judgedStoreContributed,
      view,
      argmax: gold === undefined ? null : compareArgmax(view, gold),
      current,
      topOne,
      currentGated: gate(current),
      topOneGated: gate(topOne),
      characterMass: characterMass(view)
    }
  })
  return {
    caseId: sample.caseId,
    postId: sample.postId,
    completed: true,
    calls: result.calls,
    auditStatus: result.audit.status,
    auditReasons,
    stopped: result.stopped,
    extractedItems: result.extraction.events.length,
    golds: sample.events.map((event) => {
      const match = matching.matches.find((item) => item.gold === event.uuid)
      return {
        caseId: sample.caseId,
        uuid: event.uuid,
        postCompleted: true,
        captured: match !== undefined,
        basis: match === undefined ? null : match.basis,
        explicitCharacter: event.characterIds.length > 0
      }
    }),
    candidates,
    unmatchedCandidates: matching.unmatchedCandidates.length
  }
}
