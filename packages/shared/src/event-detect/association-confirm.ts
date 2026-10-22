import { storeShortName } from './association-questions'
import {
  CHARACTER_CONFIRM_KEY,
  CHARACTER_QUESTION_KEY,
  detectionCharacters,
  detectionStores,
  STORE_CONFIRM_KEY,
  STORE_QUESTION_KEY
} from './associations'
import { type ClefQuestion, type ClefRequest, ClefRequestSchema, type ClefResponse } from './clef'

// 2段目（確認）の質問。1段目の choice で最上位に選んだ店舗・娘ごとに、はい/いいえ（noul）で別の Clef 呼び出しとして聞く（v16 以降）。
// 質問文は版ごとに固定する（webhook-prompt.ts が版定義と完全一致で検査する）。投稿ごとの値は instructions に入れず、state の末尾の行だけで渡す。
// 文言は測定（scripts/lib/event-detect/d1-confirm-requests.ts）で固定したものと同一で、この定義を測定側も参照する。変えると測定の質問の版（sha256）が変わる。
export const STORE_TARGET_LABEL = '確認対象の開催店舗'
export const CHARACTER_TARGET_LABEL = '確認対象のビッカメ娘'

export const STORE_CONFIRM_QUESTION: ClefQuestion = {
  type: 'noul',
  instructions: `state の『${STORE_TARGET_LABEL}』は、この企画の対象物（配布物・記念限定販売品）を実際に入手できる開催・配布店舗ですか？ 対象キャラクターの所属店舗と開催店舗は別です。投稿者の店舗は、文脈上そこで配布すると明らかな場合のみ「はい」としてください。`
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

const topChoice = (answers: ClefResponse['answers'], key: string): string | undefined => {
  const answer = answers[key]
  return answer?.type === 'choice' ? answer.choice : undefined
}

/**
 * 1段目の回答から、2段目で確認する対象を決める。確率の下限は見ず、choice の最上位だけで選ぶ。
 * 最上位が具体的な店舗のときだけ店舗、具体的な娘のときだけ娘を対象にする。none・multiple（と娘の other・secret）は確認の対象にならない。
 */
export const confirmTargetOf = (answers: ClefResponse['answers']): ConfirmTarget => {
  const store = topChoice(answers, STORE_QUESTION_KEY)
  const character = topChoice(answers, CHARACTER_QUESTION_KEY)
  return { ...(isConcreteStore(store) ? { store } : {}), ...(isConcreteCharacter(character) ? { character } : {}) }
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

/**
 * 確認の関門を通るか。request に確認の質問が無い（v15 以前の保存データや、確認の対象にならなかった項目）ときは関門を掛けず通す。
 * 質問があるときは、「はい」の確率が下限以上のときだけ通す。回答が欠けていれば通さない。
 */
export const passesConfirm = (
  request: ClefRequest,
  answers: ClefResponse['answers'],
  key: string,
  threshold: number
): boolean => {
  if (request.questions[key] === undefined) return true
  const probability = yesProbability(answers, key)
  return probability !== null && probability >= threshold
}
