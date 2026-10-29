import type { AnswerRow } from './answer-view'
import {
  CHARACTER_QUESTION_KEY,
  CHARACTER_STORE,
  STORE_QUESTION_KEY,
  selectedCharacterIds,
  selectedStores
} from './associations'
import type { ClefAnswer } from './clef'

/** 1 - 0.7224 が 0.27759999999999996 になるような浮動小数点ノイズを表示値に出さないため、確率は4桁に丸める（回答表の全行で共有）。 */
export const roundProbability = (value: number): number => Math.round(value * 10000) / 10000

/**
 * 開催店舗の最上位が具体的な店舗 S のとき、S の娘の ID（店舗 ID と娘 ID は同じ。判定の detection-character.ts と同じ selectedCharacterIds で引く）。
 * 店舗の回答が無い・choice でない（v13 未満）、最上位が none・multiple・カタログに無い値、娘として無効な ID なら undefined。
 */
const storeGirlOf = (answers: Record<string, ClefAnswer>): string | undefined => {
  const store = answers[STORE_QUESTION_KEY]
  if (store?.type !== 'choice') return undefined
  const [selected] = selectedStores(store.choice)
  return selected === undefined ? undefined : selectedCharacterIds(selected)[0]
}

/**
 * 「対象ビッカメ娘」の行を、店舗の娘（store_character）と店舗 S の娘自身を 1 つにまとめた行にする。まとめないときは undefined（従来の行を使う）。
 *
 * 店舗が S のとき、store_character（本文に言及がないので開催店舗の娘）と S の娘は同じ人物を指す。別々の確率で出すと、
 * 「店舗の娘 74.2%、次点 あべのたん 12.4%」のように本来の確からしさ（86.6〜86.7%）が割れて見える。
 * 判定（resolveCharacterIds）は変えない。最上位が store_character なら確率に関係なく店舗の娘を採用する、その結果と表示を揃えるだけ。
 *
 * まとめる条件（すべて満たすとき）:
 *  - 開催店舗の最上位が具体的な店舗 S。
 *  - 娘の確率に store_character と S の娘の両方がある。
 *  - 娘の最上位が store_character か S の娘自身。別の店舗の娘や other などが最上位なら、その確率を従来どおり出す。
 * まとめた行: 確率は 2 つの合算（4桁丸めの前に足してから丸める）。回答は最上位が store_character なら「店舗の娘（S の娘の名前）」、S の娘自身なら娘の名前。
 * 次点は合算した 2 つを除く上位 2 件。確定（confirmed）は合算値としきい値の比較で、判定を確認の行が担うとき（decidedByConfirm）は null。
 * 表示のラベルは labelOf（選択肢のキー → 日本語）で引く。
 */
export const describeMergedCharacter = (
  answers: Record<string, ClefAnswer>,
  row: { label: string; threshold: number; decidedByConfirm: boolean },
  labelOf: (choice: string) => string
): AnswerRow | undefined => {
  const girl = storeGirlOf(answers)
  const answer = answers[CHARACTER_QUESTION_KEY]
  if (girl === undefined || answer?.type !== 'choice') return undefined
  const { choice, probabilities } = answer
  const storeProbability = probabilities[CHARACTER_STORE]
  const girlProbability = probabilities[girl]
  if (storeProbability === undefined || girlProbability === undefined) return undefined
  if (choice !== CHARACTER_STORE && choice !== girl) return undefined
  const probability = roundProbability(storeProbability + girlProbability)
  return {
    key: CHARACTER_QUESTION_KEY,
    label: row.label,
    answer: choice === CHARACTER_STORE ? `${labelOf(CHARACTER_STORE)}（${labelOf(girl)}）` : labelOf(girl),
    probability,
    threshold: row.threshold,
    // 画面の確率と同じ丸めた値で比べる（浮動小数点ノイズで境界がずれないように）。
    confirmed: row.decidedByConfirm ? null : probability >= row.threshold,
    alternatives: Object.entries(probabilities)
      .filter(([other]) => other !== CHARACTER_STORE && other !== girl)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([other, value]) => ({ answer: labelOf(other), probability: value }))
  }
}
