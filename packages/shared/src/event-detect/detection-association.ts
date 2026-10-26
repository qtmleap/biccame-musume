import {
  isConcreteCharacter,
  isConcreteStore,
  isConfident,
  isConfirmedYes,
  topChoice,
  wasConfirmAsked
} from './association-confirm'
import {
  CHARACTER_CONFIRM_KEY,
  CHARACTER_QUESTION_KEY,
  STORE_CONFIRM_KEY,
  STORE_QUESTION_KEY,
  selectedStores
} from './associations'
import type { ClefRequest, ClefResponse } from './clef'
import { resolveCharacterIds } from './detection-character'
import { type DetectionThresholds, thresholdOf } from './detection-thresholds'

/** 店舗・対象ビッカメ娘の採用結果。 */
export type AssociationDecision = {
  /** 採用した店舗（0 または 1 件）。 */
  stores: string[]
  /** 登録する対象ビッカメ娘（0 または 1 件）。明示がなければ採用した店舗の娘。 */
  characterIds: string[]
  /** 確認を聞いたが「はい」が下限未満（回答の欠落を含む）で、店舗を採用しなかった。 */
  storeConfirmLow: boolean
  /** 確認を聞いたが「はい」が下限未満（回答の欠落を含む）で、娘を明示として採用しなかった。 */
  characterConfirmLow: boolean
}

type Adoption = { adopted: string | undefined; confirmLow: boolean }

/**
 * 1段目の最上位を採用するか。規則は 2 つだけ。
 *  - 最上位の確率が下限（70%）以上: 2段目の確認は見ずに採用する（確認が回答にあって低くても採用）。
 *  - 下限未満: 確認を聞いて「はい」が下限以上のときだけ採用する。最上位が具体的な店舗・娘でなければ、確認の対象にならないので採用しない。
 *    確認の質問を送っていない保存データ（v15 以前）や、回答の欠落、「はい」が下限未満のときも採用しない。
 * none・multiple は、確率が高くても呼び出し側（selectedStores / resolveCharacterIds）が店舗・娘として採用しない。
 */
const adoptionOf = (
  request: ClefRequest,
  answers: ClefResponse['answers'],
  target: {
    key: string
    confirmKey: string
    choiceThreshold: number
    confirmThreshold: number
    isConcrete: (id: string | undefined) => id is string
  }
): Adoption => {
  const top = topChoice(answers, target.key)
  if (top === undefined) return { adopted: undefined, confirmLow: false }
  if (isConfident(answers[target.key], target.choiceThreshold)) return { adopted: top, confirmLow: false }
  if (!target.isConcrete(top)) return { adopted: undefined, confirmLow: false }
  if (isConfirmedYes(request, answers, target.confirmKey, target.confirmThreshold))
    return { adopted: top, confirmLow: false }
  // 確認を聞いたのに通らなかったときだけ、確認が低かったことを理由に残す。聞いていない保存データには付けない。
  return { adopted: undefined, confirmLow: wasConfirmAsked(request, target.confirmKey) }
}

/**
 * 登録する店舗と対象ビッカメ娘を決める。店舗は採用した 1 件まで、共同絵柄（multiple）は人が編集フォームで複数指定する。
 * 娘が明示されていない（70% 未満で確認が低い・確認が無い）ときは、採用した店舗の娘にして保留しない（detection-character.ts）。
 * 下限は thresholdOf を通す固定値で、answer-view.ts の回答表の確定表示も同じ値を引くので、判定と表示がずれない。
 */
export const decideAssociations = (
  request: ClefRequest,
  answers: ClefResponse['answers'],
  thresholds: DetectionThresholds
): AssociationDecision => {
  const store = adoptionOf(request, answers, {
    key: STORE_QUESTION_KEY,
    confirmKey: STORE_CONFIRM_KEY,
    choiceThreshold: thresholdOf(thresholds, STORE_QUESTION_KEY),
    confirmThreshold: thresholdOf(thresholds, STORE_CONFIRM_KEY),
    isConcrete: isConcreteStore
  })
  const character = adoptionOf(request, answers, {
    key: CHARACTER_QUESTION_KEY,
    confirmKey: CHARACTER_CONFIRM_KEY,
    choiceThreshold: thresholdOf(thresholds, CHARACTER_QUESTION_KEY),
    confirmThreshold: thresholdOf(thresholds, CHARACTER_CONFIRM_KEY),
    isConcrete: isConcreteCharacter
  })
  const stores = selectedStores(store.adopted)
  return {
    stores,
    characterIds: resolveCharacterIds({
      stores,
      choice: character.adopted,
      top: topChoice(answers, CHARACTER_QUESTION_KEY)
    }),
    storeConfirmLow: store.confirmLow,
    characterConfirmLow: character.confirmLow
  }
}
