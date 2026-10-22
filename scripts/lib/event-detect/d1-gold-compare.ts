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
  // 終了日を announce-time で比べた結果。endDate は常に strict のままで、モードで選ぶのは endDateMatchOf を通す。
  endDateAnnounceTime: boolean
}

// 終了日の比べ方。
//  strict: 候補の終了日 = D1 の終了日（終了日なし同士も一致）。既定で、これまでの数字はすべてこの定義。
//  announce-time: D1 の終了日はイベント終了後に人が確定した値で、開始時点の投稿からは取れない。
//    そこで、候補に終了日が無ければ D1 の終了日が何であっても一致とする。
//    候補に終了日があるときは D1 と同じ日付のときだけ一致で、D1 に終了日が無いのに候補にあるものは不一致。
export const END_DATE_MODES = ['strict', 'announce-time'] as const
export type EndDateMode = (typeof END_DATE_MODES)[number]
export const DEFAULT_END_DATE_MODE: EndDateMode = 'strict'

export const endDateMatches = (mode: EndDateMode, candidateEnd: string | undefined, goldEnd: string | undefined) =>
  (mode === 'announce-time' && candidateEnd === undefined) || candidateEnd === goldEnd

// 最上位の予測の終了日。日付が読めない（unknown）ものは、どのモードでも一致にしない。
const viewEndDateMatches = (mode: EndDateMode, end: CandidateView['endDate'], goldEnd: string | undefined) =>
  end.kind !== 'unknown' && endDateMatches(mode, end.kind === 'date' ? end.value : undefined, goldEnd)

// 記録済みの比較結果から、指定したモードの終了日の一致を取り出す。
export const endDateMatchOf = (fields: FieldMatches, mode: EndDateMode = DEFAULT_END_DATE_MODE) =>
  mode === 'announce-time' ? fields.endDateAnnounceTime : fields.endDate

// 核となる項目（店舗・種類・開始日）。配布条件のように本文から読めない値を含まない一致の見方。
export const CORE_FIELDS = ['store', 'category', 'startDate'] as const satisfies readonly FieldName[]

const sameSignature = (predicted: ConditionSignature | null, gold: ConditionSignature) => ({
  purchaseAmount: predicted !== null && predicted.purchaseAmount === gold.purchaseAmount,
  quantity: predicted !== null && predicted.quantity === gold.quantity,
  conditionTypes: predicted !== null && predicted.types.join(',') === gold.types.join(',')
})

// しきい値を掛けない最上位の予測を、正解の人手修正済みイベントと比べる。
export const compareArgmax = (view: CandidateView, gold: GoldEvent): FieldMatches => {
  return {
    store: view.store !== null && gold.stores.includes(view.store.choice),
    category: view.category === gold.category,
    startDate: view.startDate === gold.startDateJst,
    endDate: viewEndDateMatches('strict', view.endDate, gold.endDateJst),
    endDateAnnounceTime: viewEndDateMatches('announce-time', view.endDate, gold.endDateJst),
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
  endDate: endDateMatches('strict', candidate.endDate, gold.endDateJst),
  endDateAnnounceTime: endDateMatches('announce-time', candidate.endDate, gold.endDateJst),
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

// 項目の一致。終了日だけはモードで選ぶ（既定は strict）。
const fieldMatchOf = (fields: FieldMatches, name: FieldName, mode: EndDateMode) =>
  name === 'endDate' ? endDateMatchOf(fields, mode) : fields[name]
export const allFieldsMatch = (fields: FieldMatches, mode: EndDateMode = DEFAULT_END_DATE_MODE) =>
  FIELD_NAMES.every((name) => fieldMatchOf(fields, name, mode)) && fields.character !== false
export const coreFieldsMatch = (fields: FieldMatches) => CORE_FIELDS.every((name) => fields[name])
export const failedFields = (fields: FieldMatches, mode: EndDateMode = DEFAULT_END_DATE_MODE) => [
  ...FIELD_NAMES.filter((name) => !fieldMatchOf(fields, name, mode)),
  ...(fields.character === false ? ['character'] : [])
]
