import { CHARACTER_QUESTION_KEY, STORE_QUESTION_KEY } from '@biccame/shared/event-detect/associations'
import type { ClefAnswer, ClefQuestion, ClefRequest } from '@biccame/shared/event-detect/clef'

/** createDetectionRequest が state の末尾に足す、抽出段階の開催店舗候補の行。 */
const STORE_HINT = /抽出段階の開催店舗候補（未確定）: ([A-Za-z0-9_.-]+)/

/** 判定リクエストの state にある抽出段階の開催店舗候補。無ければ null。 */
export const hintedStore = (request: ClefRequest): string | null => {
  const matched = STORE_HINT.exec(request.state)
  return matched === null ? null : matched[1]
}

/** 選ぶ選択肢。文字列は固定、関数はリクエスト（state など）から決める。 */
export type PickChoice = string | ((request: ClefRequest) => string)

/** フェイクの AI が store / character の質問で選ぶ選択肢。省略した側は下の既定値になる。 */
export type AssociationPicks = { store?: PickChoice; character?: PickChoice }

/** 店舗の既定値は、その候補の抽出段階の店舗（state の行）。無ければ秋葉原。 */
export const DEFAULT_PICK_STORE = 'akiba'
/** 対象ビッカメ娘の既定値は、店舗とは独立に固定のアキバたん（店舗から娘を引かない）。 */
export const DEFAULT_PICK_CHARACTER = 'akiba'

const resolve = (pick: PickChoice, request: ClefRequest) => (typeof pick === 'function' ? pick(request) : pick)

/** store / character の質問で選ぶ選択肢。質問に無い選択肢を指定したらテストの誤りとして落とす。 */
export const pickedAssociation = (
  request: ClefRequest,
  key: typeof STORE_QUESTION_KEY | typeof CHARACTER_QUESTION_KEY,
  picks: AssociationPicks
): string => {
  const pick = key === STORE_QUESTION_KEY ? picks.store : picks.character
  if (pick !== undefined) return resolve(pick, request)
  if (key === CHARACTER_QUESTION_KEY) return DEFAULT_PICK_CHARACTER
  const hinted = hintedStore(request)
  return hinted === null ? DEFAULT_PICK_STORE : hinted
}

/**
 * 選んだ選択肢だけ 0.99、ほかは other の確率にした choice の回答。
 * 選択肢に無い値はそのまま選んだ扱い（確率が付かず未確定になる）。store / character の選択は associationAnswer が検査する。
 */
export const choiceAnswer = (
  question: Extract<ClefQuestion, { type: 'choice' }>,
  choice: string,
  other: number
): ClefAnswer => ({
  type: 'choice',
  choice,
  probabilities: Object.fromEntries(Object.keys(question.criteria).map((key) => [key, key === choice ? 0.99 : other]))
})

/** 質問が store / character のとき、picks から選んだ回答を返す。それ以外の質問は undefined。 */
export const associationAnswer = (
  request: ClefRequest,
  id: string,
  question: ClefQuestion,
  picks: AssociationPicks,
  other: number
): ClefAnswer | undefined => {
  if (id !== STORE_QUESTION_KEY && id !== CHARACTER_QUESTION_KEY) return undefined
  if (question.type !== 'choice') throw new Error(`${id} must be a choice question`)
  const choice = pickedAssociation(request, id, picks)
  if (!Object.hasOwn(question.criteria, choice)) throw new Error(`Unknown ${id} choice in test: ${choice}`)
  return choiceAnswer(question, choice, other)
}
