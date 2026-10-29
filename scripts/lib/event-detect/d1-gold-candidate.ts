import type { ClefAnswer } from '@biccame/shared/event-detect/clef'
import { keyToDate } from '@biccame/shared/event-detect/decide'
import { categoryOfChoice, DetectionDraftSchema } from '@biccame/shared/event-detect/detection'
import type { GoldEvent } from './d1-gold-schema'
import type { GoalJudgement } from './goal-pipeline-schema'

export type Top = { choice: string; probability: number; probabilities: Record<string, number> }
// 配布条件のうち、本文から読み取れる値だけを比べる形にそろえる（uuid や並び順は見ない）。
export type ConditionSignature = { purchaseAmount: number | null; quantity: number | null; types: string[] }
type ConditionLike = { type: string; purchaseAmount?: number; quantity?: number }

export const firstOf = <T>(rows: readonly T[]): T | null => (rows.length === 0 ? null : rows[0])

export const signatureOf = (value: { conditions: readonly ConditionLike[]; limitedQuantity?: number }) => {
  const purchase = firstOf(
    value.conditions.flatMap((condition) =>
      condition.type === 'purchase' && condition.purchaseAmount !== undefined ? [condition.purchaseAmount] : []
    )
  )
  const counted = firstOf(
    value.conditions.flatMap((condition) =>
      (condition.type === 'first_come' || condition.type === 'lottery') && condition.quantity !== undefined
        ? [condition.quantity]
        : []
    )
  )
  const signature: ConditionSignature = {
    purchaseAmount: purchase,
    quantity: value.limitedQuantity === undefined ? counted : value.limitedQuantity,
    types: [...new Set(value.conditions.map((condition) => condition.type))].sort()
  }
  return signature
}

export const goldSignature = (event: GoldEvent) =>
  signatureOf({
    conditions: event.conditions,
    ...(event.limitedQuantity === undefined ? {} : { limitedQuantity: event.limitedQuantity })
  })

export const topOf = (answer: ClefAnswer | undefined): Top | null => {
  if (answer?.type !== 'choice') return null
  const probability = answer.probabilities[answer.choice]
  return probability === undefined ? null : { choice: answer.choice, probability, probabilities: answer.probabilities }
}

// 抽出段階の開催店舗候補は、判定の入力文の末尾の行に入っている（候補が複数店舗のときは店舗ごとに分割済み）。
const STORE_HINT = /\n抽出段階の開催店舗候補（未確定）: (\S+)$/
export const extractionStoreOf = (state: string) => {
  const matched = STORE_HINT.exec(state)
  return matched === null ? null : matched[1]
}

export type CandidateView = {
  index: number
  item: string
  contextOnly: boolean
  extractionStore: string | null
  status: 'register' | 'held' | 'ignored'
  reasons: string[]
  store: Top | null
  character: Top | null
  category: string | null
  startDate: string | null
  // 終了日の最上位。'none'（記載なし）と日付が読めない場合を区別する。
  endDate: { kind: 'none' } | { kind: 'date'; value: string } | { kind: 'unknown' }
  conditions: ConditionSignature | null
}

// しきい値を掛けない最上位の予測。モデルが何を最も確からしいと見たかを測るために使う。
export const viewOf = (judgement: GoalJudgement, index: number): CandidateView => {
  const answers = judgement.response.answers
  const start = topOf(answers.start_date)
  const end = topOf(answers.end_date)
  const category = topOf(answers.category)
  const draft = DetectionDraftSchema.safeParse(judgement.draft)
  const endDate = ((): CandidateView['endDate'] => {
    if (end === null) return { kind: 'unknown' }
    if (end.choice === 'none') return { kind: 'none' }
    const date = keyToDate(end.choice)
    return date === undefined ? { kind: 'unknown' } : { kind: 'date', value: date }
  })()
  const startDate = start === null ? undefined : keyToDate(start.choice)
  return {
    index,
    item: judgement.item,
    contextOnly: judgement.contextOnly,
    extractionStore: extractionStoreOf(judgement.requests[0].state),
    status: judgement.decision.status,
    reasons: judgement.decision.reasons,
    store: topOf(answers.store),
    character: topOf(answers.character),
    // 質問にだけある gift_card は、正解（D1 のカテゴリ）と比べるため other に対応づける。
    category: category === null ? null : categoryOfChoice(category.choice),
    startDate: startDate === undefined ? null : startDate,
    endDate,
    conditions: draft.success ? signatureOf(draft.data) : null
  }
}
