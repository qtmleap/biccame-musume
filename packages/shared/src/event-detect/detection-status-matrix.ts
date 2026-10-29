import type { ClefAnswer, ClefRequest, ClefResponse } from './clef'
import { choice, evaluateWithStore, post, requestWithAssociations, response } from './detection-test-fixtures'
import type { DetectPost } from './post'

// 状態 × 日付 × 条件の全組み合わせを作る。理由の付け方を変えても、登録の可否（status）が変わらないことを確かめるための入力。
// 回答の選択肢は、投稿の本文から作られる質問にあるものだけを使う（無い選択肢は validateAnswers が弾く）。

type Overrides = Record<string, ClefAnswer>
type Axis = readonly (readonly [string, Overrides])[]
export type MatrixCell = { key: string; value: DetectPost; request: ClefRequest; response: ClefResponse }

const sure = (selected: string) => choice(selected, { [selected]: 0.99 })
// しきい値に届かない最有力。最有力は selected のまま、2 位の other との差も僅差。
const unsure = (selected: string, other: string) => choice(selected, { [selected]: 0.5, [other]: 0.4 })

/** 状態。low は最有力が end だが確率がしきい値未満で、状態が確定しない。none は「状態なし」を確定したもの。 */
export const MATRIX_STATUSES: Axis = [
  ['announce', { status: sure('announce') }],
  ['start', { status: sure('start') }],
  ['ongoing', { status: sure('ongoing') }],
  ['end', { status: sure('end') }],
  ['none', { status: sure('none') }],
  ['low', { status: unsure('end', 'announce') }]
]

const DATES: Record<'valid' | 'noEnd' | 'noStart' | 'lowStart' | 'lowEnd' | 'inverted', Overrides> = {
  valid: { start_date: sure('d20261103'), end_date: sure('d20261120') },
  noEnd: { start_date: sure('d20261103'), end_date: sure('none') },
  noStart: { start_date: sure('none'), end_date: sure('none') },
  lowStart: { start_date: unsure('d20261103', 'none'), end_date: sure('none') },
  lowEnd: { start_date: sure('d20261103'), end_date: unsure('d20261120', 'none') },
  inverted: { start_date: sure('d20261120'), end_date: sure('d20261103') }
}
const dates = (...names: (keyof typeof DATES)[]): Axis => names.map((name) => [name, DATES[name]])

const PURCHASE_CONDITIONS: Axis = [
  ['ok', {}],
  ['none', { condition: sure('none') }],
  ['low', { condition: unsure('purchase_first_come', 'none') }],
  ['noAmount', { purchase_amount: sure('none') }]
]
const CHARGE_CONDITIONS: Axis = [
  ['ok', { condition: sure('charge_first_come'), charge_amount: sure('p1000') }],
  ['noAmount', { condition: sure('charge_first_come'), charge_amount: sure('none') }]
]

const cellsOf = (name: string, value: DetectPost, dateAxis: Axis, conditionAxis: Axis): MatrixCell[] => {
  const request = requestWithAssociations(value)
  return MATRIX_STATUSES.flatMap(([status, statusAnswers]) =>
    dateAxis.flatMap(([date, dateAnswers]) =>
      conditionAxis.map(([condition, conditionAnswers]) => ({
        key: `${name}|${status}|${date}|${condition}`,
        value,
        request,
        response: response(request, { ...statusAnswers, ...dateAnswers, ...conditionAnswers })
      }))
    )
  )
}

export const matrixCells = (): MatrixCell[] => [
  // 購入条件（購入額あり）。日付と条件の揃う／揃わないの全組み合わせ。
  ...cellsOf(
    'purchase',
    post('あべのたん限定名刺 2026年11月3日から11月20日まで1,000円以上お買い上げの方に先着100枚を配布します'),
    dates('valid', 'noEnd', 'noStart', 'lowStart', 'lowEnd', 'inverted'),
    PURCHASE_CONDITIONS
  ),
  // 入金・チャージ条件（チャージ額あり／なし）。
  ...cellsOf(
    'charge',
    post('あべのたん限定名刺 2026年11月3日から11月20日まで1,000円以上のチャージで先着100枚を配布します'),
    dates('valid'),
    CHARGE_CONDITIONS
  ),
  // 本文に会員などモデルに載っていない条件の語がある投稿（unmodeled_distribution_condition が付く）。
  ...cellsOf(
    'member',
    post('あべのたん限定名刺 2026年11月3日から会員限定で先着100枚を配布します'),
    dates('noEnd', 'noStart'),
    [['ok', {}]]
  )
]

/** 判定結果を `status:理由,理由` の 1 行にする。理由の並びも含めて比べるため、順序は保つ。 */
export const outcomeOf = (cell: MatrixCell): string => {
  const result = evaluateWithStore(cell.value, cell.request, cell.response)
  return `${result.status}:${result.reasons.join(',')}`
}
