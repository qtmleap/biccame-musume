import catalog from '../generated/detection-catalog.json'
import { EventCharacterSchema } from '../schemas/event.dto'
import type { ClefResponse } from './clef'

export const detectionStores = catalog.stores
export const detectionCharacters = catalog.characters

// 店舗とビッカメ娘の質問（v13 以降）。どちらも choice 1 問で、回答のキーは質問と同じ。
export const STORE_QUESTION_KEY = 'store'
export const CHARACTER_QUESTION_KEY = 'character'
// 2段目（v16 以降）の確認の質問。1段目で選んだ最上位の店舗・娘ごとに、はい/いいえ（noul）で別の呼び出しとして聞く。
export const STORE_CONFIRM_KEY = 'store_confirm'
export const CHARACTER_CONFIRM_KEY = 'character_confirm'
/** 選択肢の特別な値。カタログの id と衝突しないことをテストで固定している。 */
export const ASSOCIATION_NONE = 'none'
export const ASSOCIATION_MULTIPLE = 'multiple'
export const CHARACTER_OTHER = 'other'
export const CHARACTER_SECRET = 'secret'

/** 選択された店舗 id から登録候補の店舗を作る。カタログにある店舗 1 つだけを採用し、none・multiple・未知の値は空にする。 */
export const selectedStores = (choice: string | undefined): string[] =>
  choice !== undefined && detectionStores.some((store) => store.id === choice) ? [choice] : []

/**
 * 選択されたビッカメ娘から登録候補の対象を作る。EventCharacterSchema に合う値（店舗キー・other・secret）1 つだけを採用し、
 * none・multiple・未知の値は空にする。共同デザインは人が編集フォームで複数指定する。
 */
export const selectedCharacterIds = (choice: string | undefined) => {
  const parsed = EventCharacterSchema.safeParse(choice)
  return parsed.success ? [parsed.data] : []
}

// 以下は v3〜v12 の保存データ（店舗・ビッカメ娘ごとの独立した noul 回答）を読むためだけの関数。新しい質問は作らない。
export const venueQuestionKey = (id: string) => `venue.${id}`
export const characterQuestionKey = (id: string) => `character.${id}`

export const associationIds = (
  answers: ClefResponse['answers'],
  kind: 'venue' | 'character',
  threshold: number
): string[] =>
  (kind === 'venue' ? detectionStores : detectionCharacters).flatMap((entry) => {
    const answer = answers[kind === 'venue' ? venueQuestionKey(entry.id) : characterQuestionKey(entry.id)]
    return answer?.type === 'noul' && answer.noul >= threshold ? [entry.id] : []
  })

export const associatedCharacterIds = (answers: ClefResponse['answers'], threshold: number) =>
  associationIds(answers, 'character', threshold).flatMap((id) => {
    const parsed = EventCharacterSchema.safeParse(id)
    return parsed.success ? [parsed.data] : []
  })
