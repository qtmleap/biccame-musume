import { storeShortName } from './association-questions'
import {
  CHARACTER_CONFIRM_KEY,
  CHARACTER_QUESTION_KEY,
  detectionCharacters,
  detectionStores,
  STORE_CONFIRM_KEY,
  STORE_QUESTION_KEY
} from './associations'
import { type ClefAnswer, type ClefQuestion, type ClefRequest, ClefRequestSchema, type ClefResponse } from './clef'

// 2段目（確認）の質問。1段目の choice の最上位の確率が下限（store・character のしきい値。既定 70%）未満の店舗・娘について、
// はい/いいえ（noul）で別の Clef 呼び出しとして聞く（v16 以降）。下限以上は確認なしで確定するので聞かない。
// 最上位の娘が店舗の娘（最上位の店舗と同じ ID）でも、具体的な娘で確率が下限未満なら娘の確認を聞く（店舗と娘は二回チェックする）。
// 「特に指定がなければその店舗の娘」は、娘が未指定のときの既定値（detection-character.ts）の話で、2回目のチェックを省く意味ではない。
// 質問文は版ごとに固定する（webhook-prompt.ts が版定義と完全一致で検査する）。投稿ごとの値は instructions に入れず、state の末尾の行だけで渡す。
// 文言は測定（scripts/lib/event-detect/d1-confirm-requests.ts）が同じ定義を参照する。変えると測定の質問の版（sha256）が変わる（店舗の質問は v18 で変えたので、v17 までの測定とは版が違う）。
export const STORE_TARGET_LABEL = '確認対象の開催店舗'
export const CHARACTER_TARGET_LABEL = '確認対象のビッカメ娘'

// v18: 本文（と引用元）に別の店舗での開催・配布が明示されていなければ、開催店舗は投稿者の店舗とみなして「はい」と答える（v17 までは「明らかな場合のみ」で控えめすぎた）。
// 「投稿者の店舗」は state の「投稿者: @… / 〇〇店」の行の店舗。確認対象が別の店舗なら、本文でその店舗での開催・配布が示されているときだけ「はい」。
export const STORE_CONFIRM_QUESTION: ClefQuestion = {
  type: 'noul',
  instructions: `state の『${STORE_TARGET_LABEL}』は、この企画の対象物（配布物・記念限定販売品）を実際に入手できる開催・配布店舗ですか？ 対象キャラクターの所属店舗と開催店舗は別です。投稿者の店舗は、state の「投稿者: @… / 〇〇店」の行の店舗です。本文（と引用元）に別の店舗で開催・配布すると明示されていなければ、この企画の開催店舗は投稿者の店舗です。確認対象が投稿者の店舗で、別の店舗での開催・配布が明示されていないときは「はい」としてください。確認対象が投稿者の店舗ではない別の店舗のときは、本文にその店舗での開催・配布が示されているときだけ「はい」としてください。`
}
// 1段目の娘の質問（choice）の趣旨と揃える。開催店舗・投稿者の娘と同一と仮定しない注意書きを含む。
export const CHARACTER_CONFIRM_QUESTION: ClefQuestion = {
  type: 'noul',
  instructions: `state の『${CHARACTER_TARGET_LABEL}』は、この企画の対象物に描かれる、または対象物そのものの対象のビッカメ娘ですか？ 開催店舗・投稿者の娘と同一と仮定しないでください。本文に名前のない娘を推測しないでください。`
}

export const CONFIRM_QUESTION_KEYS: readonly string[] = [STORE_CONFIRM_KEY, CHARACTER_CONFIRM_KEY]
export const isConfirmKey = (key: string): boolean => CONFIRM_QUESTION_KEYS.includes(key)

const storeIds = new Set<string>(detectionStores.map((store) => store.id))
const characterNames = new Map<string, string>(detectionCharacters.map((character) => [character.id, character.name]))

/** 検出用カタログにある具体的な店舗（none・multiple は含まない）。 */
export const isConcreteStore = (id: string | undefined): id is string => id !== undefined && storeIds.has(id)
/** 検出用カタログにある具体的な娘（none・multiple・other・secret は含まない）。 */
export const isConcreteCharacter = (id: string | undefined): id is string => id !== undefined && characterNames.has(id)

/** 娘の短い表示名。「ビックカメラ」も括弧の ID も付けない。 */
export const characterShortName = (id: string): string => {
  const name = characterNames.get(id)
  if (name === undefined) throw new Error('Unknown character id')
  return name
}

/** 2段目で確認する対象。店舗と娘のどちらか、または両方。 */
export type ConfirmTarget = { store?: string; character?: string }

/** choice の最上位（確率は問わない）。回答が無い・choice でない場合は undefined。 */
export const topChoice = (answers: ClefResponse['answers'], key: string): string | undefined => {
  const answer = answers[key]
  return answer?.type === 'choice' ? answer.choice : undefined
}

/** choice の最上位の確率。choice でない回答・最上位の確率が欠けた回答は null。 */
export const topProbability = (answer: ClefAnswer | undefined): number | null => {
  if (answer?.type !== 'choice') return null
  const probability = answer.probabilities[answer.choice]
  return probability === undefined ? null : probability
}

/**
 * 1段目の最上位の確率が下限以上で、2段目の確認なしに確定できるか。ちょうど下限は確定する（確認を聞かない）。
 * 確率が取れない・欠けた回答は確定できない扱い（確認を聞く側に倒す）。確認を聞くか（confirmTargetOf）と採用するか（detection-association.ts）が同じこの関数を使う。
 */
export const isConfident = (answer: ClefAnswer | undefined, threshold: number): boolean => {
  const probability = topProbability(answer)
  return probability !== null && probability >= threshold
}

/** 確認を聞かずに確定する、1段目の最上位の確率の下限（store・character のしきい値。thresholdOf で引いた値）。 */
export type ChoiceThresholds = { store: number; character: number }

/**
 * 1段目の回答から、2段目で確認する対象を決める。最上位が具体的な店舗（娘）で、かつ最上位の確率が下限（choiceThresholds。既定 70%）未満のときだけ対象にする。
 * 下限以上は確認なしで確定するので聞かない（2段目の呼び出しも減る）。確率が取れない・欠けた回答は下限未満として扱い、確認を聞く側に倒す。
 * 下限は判定（detection-association.ts）と同じ thresholdOf の値を、呼び出し側が渡す。判定と確認の対象選択で値がずれない。
 * none・multiple（と娘の other・secret・store_character）は、確認する具体的な店舗・娘が無いので対象にならない。
 * 最上位の娘が店舗の娘（最上位の店舗と同じ ID）でも、具体的な娘で下限未満なら娘を対象にする（店舗と娘は二回チェックする）。
 * 確認が低くても、娘は保留にせず採用した店舗の娘で登録する（detection-character.ts）ので、店舗の娘では判定は変わらない。
 */
export const confirmTargetOf = (
  answers: ClefResponse['answers'],
  choiceThresholds: ChoiceThresholds
): ConfirmTarget => {
  const store = topChoice(answers, STORE_QUESTION_KEY)
  const character = topChoice(answers, CHARACTER_QUESTION_KEY)
  return {
    ...(isConcreteStore(store) && !isConfident(answers[STORE_QUESTION_KEY], choiceThresholds.store) ? { store } : {}),
    ...(isConcreteCharacter(character) && !isConfident(answers[CHARACTER_QUESTION_KEY], choiceThresholds.character)
      ? { character }
      : {})
  }
}

export const hasConfirmTarget = (target: ConfirmTarget): boolean =>
  target.store !== undefined || target.character !== undefined

/** 確認対象の質問。店舗と娘のどちらも対象なら 1 リクエストにまとめる（キーは store_confirm・character_confirm）。 */
export const confirmQuestions = (target: ConfirmTarget): Record<string, ClefQuestion> => ({
  ...(target.store === undefined ? {} : { [STORE_CONFIRM_KEY]: STORE_CONFIRM_QUESTION }),
  ...(target.character === undefined ? {} : { [CHARACTER_CONFIRM_KEY]: CHARACTER_CONFIRM_QUESTION })
})

/** state の末尾に足す、確認対象の行。店舗名・娘の名前は短い名前だけにする。 */
export const confirmStateLines = (target: ConfirmTarget): string[] => [
  ...(target.store === undefined ? [] : [`${STORE_TARGET_LABEL}: ${storeShortName(target.store)}`]),
  ...(target.character === undefined ? [] : [`${CHARACTER_TARGET_LABEL}: ${characterShortName(target.character)}`])
]

/**
 * 1段目の request（state と model）の末尾に確認対象の行を足した、2段目の request を作る。
 * 対象が 1 つも無いときは作れない（呼び出し側が hasConfirmTarget で確かめてから呼ぶ）。
 */
export const createConfirmRequest = (first: ClefRequest, target: ConfirmTarget): ClefRequest => {
  const lines = confirmStateLines(target)
  if (lines.length === 0) throw new Error('A confirm request needs at least one target')
  const parsed = ClefRequestSchema.safeParse({
    model: first.model,
    state: [first.state, ...lines].join('\n'),
    questions: confirmQuestions(target)
  })
  if (!parsed.success) throw new Error('Invalid confirm request')
  return parsed.data
}

/** 応答から確認の「はい」の確率を取り出す。noul 以外の形や欠落は null。 */
export const yesProbability = (answers: ClefResponse['answers'], key: string): number | null => {
  const answer = answers[key]
  return answer?.type === 'noul' ? answer.noul : null
}

/** request に確認の質問を送ったか。送っていない（v15 以前の保存データや、確認の対象にならなかった項目）なら false。 */
export const wasConfirmAsked = (request: ClefRequest, key: string): boolean => request.questions[key] !== undefined

/**
 * 確認が通ったか（確認を聞いて「はい」が下限以上か）。質問を送っていない・回答が欠けている・下限未満なら通らない。
 * 質問が無ければ「通す」関門ではなく、「確認では確定できない」。1段目の最上位が下限以上の項目は、確認を聞かないのでこの関数を使わない。
 */
export const isConfirmedYes = (
  request: ClefRequest,
  answers: ClefResponse['answers'],
  key: string,
  threshold: number
): boolean => {
  if (!wasConfirmAsked(request, key)) return false
  const probability = yesProbability(answers, key)
  return probability !== null && probability >= threshold
}
