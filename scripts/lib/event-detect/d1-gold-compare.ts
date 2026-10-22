import type { DetectionCandidate } from '@biccame/shared/event-detect/detection'
import { type CandidateView, type ConditionSignature, goldSignature, signatureOf } from './d1-gold-candidate'
import type { GoldEvent } from './d1-gold-schema'

export const FIELD_NAMES = [
  'store',
  'category',
  'startDate',
  'endDate',
  'purchaseAmount',
  'quantity',
  'conditionTypes'
] as const
export type FieldName = (typeof FIELD_NAMES)[number]
export type FieldMatches = Record<FieldName, boolean> & {
  // 正解に明示されたビッカメ娘があるときだけ比べる（空は未注釈なので比べない）。
  character: boolean | null
}

// 核となる項目（店舗・種類・開始日）。配布条件のように本文から読めない値を含まない一致の見方。
export const CORE_FIELDS = ['store', 'category', 'startDate'] as const satisfies readonly FieldName[]

const sameSignature = (predicted: ConditionSignature | null, gold: ConditionSignature) => ({
  purchaseAmount: predicted !== null && predicted.purchaseAmount === gold.purchaseAmount,
  quantity: predicted !== null && predicted.quantity === gold.quantity,
  conditionTypes: predicted !== null && predicted.types.join(',') === gold.types.join(',')
})

// しきい値を掛けない最上位の予測を、正解の人手修正済みイベントと比べる。
export const compareArgmax = (view: CandidateView, gold: GoldEvent): FieldMatches => {
  const end = view.endDate
  const goldEnd = gold.endDateJst
  return {
    store: view.store !== null && gold.stores.includes(view.store.choice),
    category: view.category === gold.category,
    startDate: view.startDate === gold.startDateJst,
    endDate: goldEnd === undefined ? end.kind === 'none' : end.kind === 'date' && end.value === goldEnd,
    ...sameSignature(view.conditions, goldSignature(gold)),
    character:
      gold.characterIds.length === 0
        ? null
        : view.character !== null && gold.characterIds.includes(view.character.choice)
  }
}

// 登録された候補（しきい値を通ったもの）を正解と比べる。
export const compareRegistered = (candidate: DetectionCandidate, gold: GoldEvent): FieldMatches => ({
  store:
    candidate.stores.length === gold.stores.length && candidate.stores.every((store) => gold.stores.includes(store)),
  category: candidate.category === gold.category,
  startDate: candidate.startDate === gold.startDateJst,
  endDate: candidate.endDate === gold.endDateJst,
  ...sameSignature(
    signatureOf({
      conditions: candidate.conditions,
      ...(candidate.limitedQuantity === undefined ? {} : { limitedQuantity: candidate.limitedQuantity })
    }),
    goldSignature(gold)
  ),
  character:
    gold.characterIds.length === 0
      ? null
      : candidate.characterIds.length === gold.characterIds.length &&
        candidate.characterIds.every((id) => gold.characterIds.includes(id))
})

export const allFieldsMatch = (fields: FieldMatches) =>
  FIELD_NAMES.every((name) => fields[name]) && fields.character !== false
export const coreFieldsMatch = (fields: FieldMatches) => CORE_FIELDS.every((name) => fields[name])
export const failedFields = (fields: FieldMatches) => [
  ...FIELD_NAMES.filter((name) => !fields[name]),
  ...(fields.character === false ? ['character'] : [])
]
