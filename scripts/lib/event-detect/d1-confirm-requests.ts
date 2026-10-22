import { createHash } from 'node:crypto'
import {
  CHARACTER_CONFIRM_QUESTION,
  CHARACTER_TARGET_LABEL,
  characterShortName,
  type ConfirmTarget,
  confirmStateLines,
  isConcreteCharacter,
  isConcreteStore,
  STORE_CONFIRM_QUESTION,
  STORE_TARGET_LABEL,
  yesProbability
} from '@biccame/shared/event-detect/association-confirm'
import { detectionCharacters, STORE_CONFIRM_KEY } from '@biccame/shared/event-detect/associations'
import { type ClefQuestion, type ClefRequest, ClefRequestSchema } from '@biccame/shared/event-detect/clef'

// 2段階目（確認）の質問の測定用。本番（packages/shared/src/event-detect/association-confirm.ts）に移した文言を参照し、
// 本番に採用しなかった娘の質問 B（注意書きなし）だけをここに持つ。測定のキーと質問文はこれまでと同一で、変えると confirmQuestionsSha256 が変わる。
export { characterShortName, isConcreteCharacter, isConcreteStore, STORE_TARGET_LABEL, CHARACTER_TARGET_LABEL, yesProbability }
export type { ConfirmTarget }
export { STORE_CONFIRM_KEY }
export const CHARACTER_CONFIRM_A_KEY = 'character_confirm_a'
export const CHARACTER_CONFIRM_B_KEY = 'character_confirm_b'

// 本番に採用した娘の質問（現行の娘の choice の趣旨。開催店舗・投稿者の娘と同一と仮定しない注意書きを含む）。
const CHARACTER_CONFIRM_A: ClefQuestion = CHARACTER_CONFIRM_QUESTION
// 注意書きなし。未注釈の大半は店舗の娘と見なされる D1 に合わせたとき、注意書きが確率を下げているかを見る。
const CHARACTER_CONFIRM_B: ClefQuestion = {
  type: 'noul',
  instructions: `state の『${CHARACTER_TARGET_LABEL}』は、この企画の対象物に描かれる、または対象物そのものの対象のビッカメ娘ですか？`
}

export const CONFIRM_QUESTION_KEYS = [STORE_CONFIRM_KEY, CHARACTER_CONFIRM_A_KEY, CHARACTER_CONFIRM_B_KEY] as const

// 質問文の版。台帳の moduleSha256 欄に入れ、どの質問文で送ったかを台帳から追えるようにする。
export const confirmQuestionsSha256 = createHash('sha256')
  .update(JSON.stringify([STORE_CONFIRM_QUESTION, CHARACTER_CONFIRM_A, CHARACTER_CONFIRM_B]))
  .digest('hex')

export const concreteCharacterIds = (): readonly string[] => detectionCharacters.map((character) => character.id)

// 保存済みの判定リクエストの state の末尾に、確認対象の行を足す。店舗か娘のどちらか（または両方）。
export const confirmRequest = (state: string, target: ConfirmTarget): ClefRequest => {
  const lines = confirmStateLines(target)
  if (lines.length === 0) throw new Error('A confirm request needs at least one target')
  const questions: Record<string, ClefQuestion> = {
    ...(target.store === undefined ? {} : { [STORE_CONFIRM_KEY]: STORE_CONFIRM_QUESTION }),
    ...(target.character === undefined
      ? {}
      : { [CHARACTER_CONFIRM_A_KEY]: CHARACTER_CONFIRM_A, [CHARACTER_CONFIRM_B_KEY]: CHARACTER_CONFIRM_B })
  }
  const parsed = ClefRequestSchema.safeParse({ model: 'clef', state: [state, ...lines].join('\n'), questions })
  if (!parsed.success) throw new Error('Invalid confirm request')
  return parsed.data
}
