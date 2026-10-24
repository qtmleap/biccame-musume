import { createHash } from 'node:crypto'
import { detectionCharacters, detectionStores } from '@biccame/shared/event-detect/associations'
import {
  type ClefQuestion,
  type ClefRequest,
  ClefRequestSchema,
  type ClefResponse
} from '@biccame/shared/event-detect/clef'
import { storeShortName } from '../../../packages/shared/src/event-detect/association-questions'

// 2段階目（確認）の質問。キーと文面はこの測定で固定する。投稿ごとの値は instructions に入れず、state の末尾の行だけで渡す。
export const STORE_CONFIRM_KEY = 'store_confirm'
export const CHARACTER_CONFIRM_A_KEY = 'character_confirm_a'
export const CHARACTER_CONFIRM_B_KEY = 'character_confirm_b'
export const STORE_TARGET_LABEL = '確認対象の開催店舗'
export const CHARACTER_TARGET_LABEL = '確認対象のビッカメ娘'

const STORE_CONFIRM: ClefQuestion = {
  type: 'noul',
  instructions: `state の『${STORE_TARGET_LABEL}』は、この企画の対象物（配布物・記念限定販売品）を実際に入手できる開催・配布店舗ですか？ 対象キャラクターの所属店舗と開催店舗は別です。投稿者の店舗は、文脈上そこで配布すると明らかな場合のみ「はい」としてください。`
}
// 現行（v15）の娘の質問の趣旨。開催店舗・投稿者の娘と同一と仮定しない注意書きを含む。
const CHARACTER_CONFIRM_A: ClefQuestion = {
  type: 'noul',
  instructions: `state の『${CHARACTER_TARGET_LABEL}』は、この企画の対象物に描かれる、または対象物そのものの対象のビッカメ娘ですか？ 開催店舗・投稿者の娘と同一と仮定しないでください。本文に名前のない娘を推測しないでください。`
}
// 注意書きなし。未注釈の大半は店舗の娘と見なされる D1 に合わせたとき、注意書きが確率を下げているかを見る。
const CHARACTER_CONFIRM_B: ClefQuestion = {
  type: 'noul',
  instructions: `state の『${CHARACTER_TARGET_LABEL}』は、この企画の対象物に描かれる、または対象物そのものの対象のビッカメ娘ですか？`
}

export const CONFIRM_QUESTION_KEYS = [STORE_CONFIRM_KEY, CHARACTER_CONFIRM_A_KEY, CHARACTER_CONFIRM_B_KEY] as const

// 質問文の版。台帳の moduleSha256 欄に入れ、どの質問文で送ったかを台帳から追えるようにする。
export const confirmQuestionsSha256 = createHash('sha256')
  .update(JSON.stringify([STORE_CONFIRM, CHARACTER_CONFIRM_A, CHARACTER_CONFIRM_B]))
  .digest('hex')

const storeIds = new Set<string>(detectionStores.map((store) => store.id))
const characterNames = new Map<string, string>(detectionCharacters.map((character) => [character.id, character.name]))

export const isConcreteStore = (id: string) => storeIds.has(id)
export const isConcreteCharacter = (id: string) => characterNames.has(id)
export const concreteCharacterIds = (): readonly string[] => [...characterNames.keys()]

// 娘の短い表示名。「ビックカメラ」も括弧の ID も付けない。
export const characterShortName = (id: string) => {
  const name = characterNames.get(id)
  if (name === undefined) throw new Error('Unknown character id')
  return name
}

export type ConfirmTarget = { store?: string; character?: string }

// 保存済みの判定リクエストの state の末尾に、確認対象の行を足す。店舗か娘のどちらか（または両方）。
export const confirmRequest = (state: string, target: ConfirmTarget): ClefRequest => {
  const lines = [
    ...(target.store === undefined ? [] : [`${STORE_TARGET_LABEL}: ${storeShortName(target.store)}`]),
    ...(target.character === undefined ? [] : [`${CHARACTER_TARGET_LABEL}: ${characterShortName(target.character)}`])
  ]
  if (lines.length === 0) throw new Error('A confirm request needs at least one target')
  const questions: Record<string, ClefQuestion> = {
    ...(target.store === undefined ? {} : { [STORE_CONFIRM_KEY]: STORE_CONFIRM }),
    ...(target.character === undefined
      ? {}
      : { [CHARACTER_CONFIRM_A_KEY]: CHARACTER_CONFIRM_A, [CHARACTER_CONFIRM_B_KEY]: CHARACTER_CONFIRM_B })
  }
  const parsed = ClefRequestSchema.safeParse({ model: 'clef', state: [state, ...lines].join('\n'), questions })
  if (!parsed.success) throw new Error('Invalid confirm request')
  return parsed.data
}

// 応答から確認の「はい」の確率を取り出す。noul 以外の形や欠落は null。
export const yesProbability = (answers: ClefResponse['answers'], key: string) => {
  const answer = answers[key]
  return answer?.type === 'noul' ? answer.noul : null
}
