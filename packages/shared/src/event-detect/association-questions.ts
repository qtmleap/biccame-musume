import { STORE_DISPLAY_NAMES } from '../domain/badges/store-display-names'
import { StoreKeySchema } from '../schemas/store.dto'
import {
  ASSOCIATION_MULTIPLE,
  ASSOCIATION_NONE,
  CHARACTER_OTHER,
  CHARACTER_QUESTION_KEY,
  CHARACTER_SECRET,
  detectionCharacters,
  detectionStores,
  STORE_QUESTION_KEY
} from './associations'
import type { ClefQuestion } from './clef'

// 質問文は版ごとに固定する（webhook-prompt.ts が版定義と完全一致で検査する）。投稿ごとに変わる情報は state にだけ入れる。
// 店舗と娘は独立した軸で、どちらも choice 1 問。娘の名前や投稿アカウントは選択肢の説明に入れない（投稿者は state の「投稿者」の行にある）。
// 選択肢の説明は名前だけにする。キー自体が id なので、括弧書きの id や「ビックカメラ」の接頭辞は付けない（v14 で簡潔にした）。
// v13 の説明は「名前（id）」の形で、定義は generated/webhook-prompt-definitions.json に固定して残っている。ここで作るのは現行版（v14）の説明だけ。

const STORE_INSTRUCTIONS = [
  'この企画の対象物（配布物・記念限定販売品）を実際に入手できる開催・配布店舗はどれですか？ 1つの企画の開催店舗は1つだけです。',
  '対象キャラクターの所属店舗と開催店舗は別です（A店舗でXたんの配布物を配る場合、開催店舗はAです）。',
  '投稿者の店舗は、文脈上そこで配布すると明らかな場合のみ採用し、別店舗での配布案内なら投稿者の店舗を採用しないでください。',
  'state に「抽出段階の開催店舗候補（未確定）」の行がある場合は、その店舗でこの企画が実施されるかを判定対象にしてください。',
  `複数の店舗が並記されて1つに決まらないときは ${ASSOCIATION_MULTIPLE}、店舗を特定できないときやビッカメ娘の企画ではないときは ${ASSOCIATION_NONE} を選んでください。`
].join('')

// is_event の除外条項と同じ内容を、none（ビッカメ娘の企画ではない）の定義として持つ。
// 汎用ギフトカードの通常販売・チャージ案内などを登録しないための判定は、これが担う。
const CHARACTER_INSTRUCTIONS = [
  'この企画の対象物（配布物・記念限定販売品）に描かれる、または対象物そのものの対象のビッカメ娘は誰ですか？ 開催店舗・投稿者の娘と同一と仮定しないでください。本文に名前のない娘を推測しないでください。',
  `共同デザインなど複数の娘が対象で1人に決まらないときは ${ASSOCIATION_MULTIPLE} を選んでください。ビッカメ娘の企画だが特定の娘に紐付かないときは ${CHARACTER_OTHER}、対象が伏せられているときは ${CHARACTER_SECRET} を選んでください。`,
  `ビッカメ娘の企画ではない場合は ${ASSOCIATION_NONE} を選んでください。ビッカメ娘の企画ではない例は、汎用ギフトカードの通常販売・購入・残高チャージ方法・支払い方法の案内だけの投稿、通常の商品紹介・家電の宣伝・雑談、ビッカメ娘と関係ない商品の購入特典・メーカーのキャンペーンです。ビッカメ娘の記念・限定デザインを対象にした販売・頒布や、ギフトカードの入金・チャージ条件付き受取は、無料配布かどうかにかかわらずビッカメ娘の企画なので ${ASSOCIATION_NONE} にしません。`
].join('')

/**
 * 店舗の短い名前。店舗キーはアプリの短い名前（STORE_DISPLAY_NAMES。画面と回答表が使う定義元）で、「ビックカメラ」を付けない。
 * 店舗キーでない id は、検出用カタログ名から「ビックカメラ」の接頭辞を取って使い、カタログにも無ければ id のまま返す。
 */
export const storeShortName = (id: string): string => {
  const key = StoreKeySchema.safeParse(id)
  if (key.success) return STORE_DISPLAY_NAMES[key.data]
  const store = detectionStores.find((entry) => entry.id === id)
  return store === undefined ? id : store.name.replace(/^ビックカメラ/, '')
}

/** 店舗 44 件の短い名前（id と「ビックカメラ」は付けない）と、複数・該当なし。 */
export const storeCriteria = (): Record<string, string> => ({
  ...Object.fromEntries(detectionStores.map((store) => [store.id, storeShortName(store.id)])),
  [ASSOCIATION_MULTIPLE]: '複数の店舗が並記されていて、開催店舗を1つに決められない',
  [ASSOCIATION_NONE]: '開催・配布店舗を特定できない、またはビッカメ娘の企画ではない'
})

/** ビッカメ娘 51 人の名前（id は付けない）と、その他・秘密・複数・該当なし。 */
export const characterCriteria = (): Record<string, string> => ({
  ...Object.fromEntries(detectionCharacters.map((character) => [character.id, character.name])),
  [CHARACTER_OTHER]: 'ビッカメ娘の企画だが、特定の娘に紐付かない',
  [CHARACTER_SECRET]: '対象のビッカメ娘が伏せられている（シークレット）',
  [ASSOCIATION_MULTIPLE]: '共同デザインなど、複数の娘が対象で1人に決められない',
  [ASSOCIATION_NONE]:
    'ビッカメ娘の企画ではない（汎用ギフトカードの通常販売・チャージ方法の案内、商品宣伝、ビッカメ娘と関係ないキャンペーンなど）'
})

/** 開催店舗と対象ビッカメ娘を、それぞれ choice 1 問で尋ねる質問。 */
export const associationQuestions = (): Record<string, ClefQuestion> => ({
  [STORE_QUESTION_KEY]: { type: 'choice', instructions: STORE_INSTRUCTIONS, criteria: storeCriteria() },
  [CHARACTER_QUESTION_KEY]: { type: 'choice', instructions: CHARACTER_INSTRUCTIONS, criteria: characterCriteria() }
})
