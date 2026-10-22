import { associationQuestions, storeShortName } from './association-questions'
import { type ClefModel, type ClefRequest, ClefRequestSchema } from './clef'
import { baseQuestions, buildState, STATUS_CRITERIA, type StoreAccount, valueQuestions } from './decide'
import { conditionQuestions } from './detection-conditions'
import { accounts, labels } from './detection-context'
import { normalizeText } from './filter'
import type { DetectPost } from './post'

const detectionCategories = {
  limited_card: '期間限定・数量限定・記念の名刺',
  regular_card: '通年配布の通常名刺',
  ackey: 'アクリルキーホルダー（アクキー）。キーホルダー形状のもの。コースター・スタンド・プレートは含まない',
  acsta: 'アクリルスタンド（アクスタ）。立てて飾る形状のもの。コースター・キーホルダー・プレートは含まない',
  other:
    '缶バッジ・ステッカー・ポストカード・ギフトカード・アクリルコースター・アクリルプレートなど、名刺・アクキー・アクスタ以外（ギフトカードを名刺に分類しない。アクリル製でもキーホルダーとスタンド以外はこちら）',
  none: '企画の対象となる物品が記載されていない、または物品種別を特定できない'
}
/**
 * 判定の入力文（state）の「投稿者」の行に出す店舗名。「ビックカメラ」も括弧の店舗IDも付けない短い名前で、
 * 店舗の選択肢の説明（v14〜）と同じ storeShortName を使う。抽出や CLI の入力文は buildState の既定（店舗名（店舗ID））のまま。
 */
export const detectionAuthorLabel = (account: StoreAccount): string => storeShortName(account.storeId)

// 状態は buildState が渡す「投稿日」の行と、本文の配布の開始日の前後関係で決まる。判定時の今日ではなく投稿日を基準にする
// （再判定は後日に走るため、今日と比べると意味が変わる）。選択肢の説明は STATUS_CRITERIA のまま、比べ方だけを質問文に足す。
// decide.ts の baseQuestions.status は CLI と共用なので、Webhook 判定の createDetectionRequest だけで上書きする。
const STATUS_INSTRUCTIONS = [
  'この投稿が伝えている配布イベントの状態はどれですか？ 『投稿日』の行と、本文に書かれた配布の開始日を比べて選んでください（今日の日付とは比べません）。',
  '・開始日が投稿日より後: 配布開始前の告知（announce）',
  '・開始日が投稿日と同じ日（『本日から』『配布開始』など）: 開始（start）',
  '・開始日が投稿日より前: 告知ではありません。まだ配布中（『配布中』『まだあります』など）なら継続（ongoing）、『終了』『なくなりました』などなら終了（end）'
].join('\n')
// Clef がアクリル系を区別できず確率が割れる（新東たんの投稿で other 0.36 / acsta 0.29 / ackey 0.29）ため、
// 本文に根拠語が無い種類は選択肢に出さない。根拠語が無いものは other に落ちる。other と none は常に残す
// （選択肢は2個以上が必要で、none は記念イベントの告知だけで配布物が出てこない投稿を保留にするために要る）。
// filter.ts の KEYWORD_GROUPS.item のうち名刺・アクキー・アクリルキーホルダー・アクスタ・アクリルスタンドは
// ここでも根拠語になる。「キーホルダー」「スタンド」だけの書き方も拾うので、こちらの方が少し広い。
// 逆に缶バッジ・ステッカー・ポストカードなどは other の説明に含まれるため根拠語を持たない（常に other が残る）。
// 「限定カード」「アクリルスタンディ」のように上の語に合わない書き方は選択肢に出ず、Clef が other と答えれば他の種類として登録される
// （確率が足りなければ category_unconfirmed で保留）。other の説明は「名刺以外」を含むので、取りこぼしは誤登録になりうる点に注意。
const categoryEvidence: ReadonlyMap<string, RegExp> = new Map([
  ['limited_card', /名刺/],
  ['regular_card', /名刺/],
  ['ackey', /アクキー|キーホルダ[ー―−ｰ]/],
  ['acsta', /アクスタ|スタンド/]
])
/** 本文（引用元を含む）に根拠語がある種類だけに絞った category の選択肢。キーの並びは detectionCategories のまま。 */
const categoryCriteriaOf = (post: DetectPost) => {
  const text = normalizeText(post.quoted?.text ? `${post.text}\n${post.quoted.text}` : post.text)
  return Object.fromEntries(
    Object.entries(detectionCategories).filter(([key]) => {
      const evidence = categoryEvidence.get(key)
      return evidence === undefined || evidence.test(text)
    })
  )
}

export const createDetectionRequest = (
  post: DetectPost,
  model: ClefModel = 'clef',
  storeKey: string | null = null
): ClefRequest => {
  const values = valueQuestions(post, [], labels)
  // 抽出店舗は証拠のヒントであり、アカウントや抽出結果だけでは確定しない。
  const valueEntries = values.questions
  const base = baseQuestions()
  const request: ClefRequest = {
    model,
    state: `${buildState(post, accounts, detectionAuthorLabel)}${storeKey === null ? '' : `\n抽出段階の開催店舗候補（未確定）: ${storeKey}`}`,
    questions: {
      ...base,
      // Webhook 判定で見るのは「ビッカメ娘のイベントか」。配布物の種類は category が別に担当するため、ここでは配布に限定しない。
      is_event: {
        type: 'noul',
        instructions:
          'この投稿は、ビッカメ娘（ビックカメラの店舗擬人化キャラクター）に関するイベント（擬人化記念イベント、名刺・ギフトカード・グッズ・ノベルティの配布、コラボ、フェアなど、日時を決めて行う催し）についての投稿ですか？ ビッカメ娘の記念・限定デザインを対象にした販売・頒布や、ギフトカードの入金・チャージ条件付き受取も含みます。無料配布かどうかだけで否定しません。一方、ビッカメ娘の企画ではない汎用ギフトカードの通常販売・購入・残高チャージ方法・支払い方法の案内だけは含みません。通常の商品紹介・家電の宣伝・雑談や、ビッカメ娘と関係ない商品の購入特典・メーカーのキャンペーンは含みません。投稿者の店舗名が「投稿者」の行に書かれている場合、投稿者はその店舗（ビッカメ娘）本人のアカウントです。本文に店舗名・キャラクター名・「ビッカメ娘」の言及が無くても、投稿者の店舗のイベント（記念イベント・配布など）の告知であれば「はい」と答えてください。投稿者が「店舗以外」のときはこの扱いをしません。'
      },
      status: { type: 'choice', instructions: STATUS_INSTRUCTIONS, criteria: { ...STATUS_CRITERIA } },
      category: {
        type: 'choice',
        instructions:
          '本文で企画の対象として明示されている物品は、どの種類ですか？ ここでは物品の種別だけを分類します。無料か有料か、配布・販売・頒布の違い、購入・入金などの条件、対象イベントかどうかを理由にnoneを選ばないでください。イベントの適否は別のis_event質問に任せます。ギフトカードと明記された対象物はotherであり、販売品でもnoneにしません。noneは対象となる物品の記載がない、または物品種別を特定できない場合だけです。別の商品を買う際の決済手段として言及されるだけのカードは対象物に数えません。',
        criteria: categoryCriteriaOf(post)
      },
      ...valueEntries,
      ...associationQuestions(),
      ...conditionQuestions(post)
    }
  }
  const parsed = ClefRequestSchema.safeParse(request)
  if (!parsed.success) throw new Error('Invalid detection request')
  return parsed.data
}

/**
 * 店舗とビッカメ娘は、それぞれ choice 1 問で尋ねる（全体で64問以内）ため、送信は1バッチ。
 * 呼び出し側（runWebhookDetection・ベンチマーク）が配列を前提にしているので、配列のまま返す。
 */
export const createDetectionRequests = (
  post: DetectPost,
  model: ClefModel = 'clef',
  storeKey: string | null = null
): ClefRequest[] => [createDetectionRequest(post, model, storeKey)]
