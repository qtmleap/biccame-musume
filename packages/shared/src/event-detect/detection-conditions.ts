import type { ClefRequest } from './clef'
import { normalizeText } from './filter'
import type { DetectPost } from './post'

const purchaseWords = 'お買い上げ|お買上げ|ご購入|購入|お買い物|お買物|買い物|買物'
const purchasePatterns = [
  new RegExp(
    `(?<!\\d)(\\d{1,7})円(?:\\((?:税込|税抜)\\))?(?:以上)?(?:\\((?:税込|税抜)\\))?(?:の|を|分)?(?:${purchaseWords})`,
    'g'
  ),
  new RegExp(`(?:${purchaseWords})(?:金額|額|合計)?(?:が|は|を)?(?:税込|税抜)?(?<!\\d)(\\d{1,7})円(?:以上)`, 'g')
]
const chargePatterns = [
  /(?:入金|チャージ)(?:金額|額|合計)?(?:が|は|を|に)?(?:税込|税抜)?(?<!\d)(\d{1,7})円(?:以上)?/g,
  /(?<!\d)(\d{1,7})円(?:以上)?(?:の|を|分)?(?:入金|チャージ)/g
]
const amountsOf = (text: string, patterns: readonly RegExp[]): number[] =>
  [...new Set(patterns.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => Number(match[1]))))].sort(
    (a, b) => a - b
  )

const conditionTextOf = (post: DetectPost) => normalizeText(post.text).replaceAll(',', '')
const hasPurchaseWord = (text: string) => /お買い上げ|お買上げ|購入|買い物|買物|会計|レシート/.test(text)
const hasChargeWord = (text: string) => /入金|チャージ/.test(text)

/**
 * 「円以上」だけがあり、購入・入金の語がない曖昧な本文か。条件を決めてはいけず、人が確認する。
 * conditionQuestions（質問を作らない）と登録判定（条件なしを全員とみなさない）で同じ式を共有する。
 */
export const hasAmbiguousMoney = (post: DetectPost): boolean => {
  const text = conditionTextOf(post)
  return /円以上/.test(text) && !hasPurchaseWord(text) && !hasChargeWord(text)
}

/** 先着と抽選の両方の語がある本文か。条件の語はあるのに質問の選択肢にできない（conditionQuestions は質問を作らない）ので、条件なしとはみなさない。 */
export const hasFirstComeAndLottery = (post: DetectPost): boolean => {
  const text = conditionTextOf(post)
  return /先着/.test(text) && /抽選/.test(text)
}

/** モデルに載っていない入手条件（会員・提示・予約など）の語があるか。全員配布とはみなさない。 */
export const hasUnsupportedCondition = (post: DetectPost): boolean =>
  /会員|ポイントカード|フォロー|リポスト|アンケート|提示|予約|注文|対象商品|対象製品|キーワード|合言葉|あいことば/.test(
    normalizeText(post.text)
  )

/** 購入と入金は異なる条件。単に「円以上」があるだけでは購入と推定しない。 */
export const conditionQuestions = (post: DetectPost): ClefRequest['questions'] => {
  const text = conditionTextOf(post)
  const purchase = hasPurchaseWord(text)
  const charge = hasChargeWord(text)
  const firstCome = /先着/.test(text)
  const lottery = /抽選/.test(text)
  const everyone = /どなたでも|全員(?:に|へ)|来店.{0,10}皆様/.test(text)
  const ambiguousMoney = hasAmbiguousMoney(post)
  const payment = [purchase ? 'purchase' : '', charge ? 'charge' : ''].filter(Boolean).join('_')
  const paymentLabel = [purchase ? '商品購入' : '', charge ? '入金・チャージ' : ''].filter(Boolean).join('と')
  const condition = firstCome && !lottery ? 'first_come' : lottery && !firstCome ? 'lottery' : ''
  const suffix = condition === 'first_come' ? '先着順' : condition === 'lottery' ? '抽選' : ''
  const key = [payment, condition].filter(Boolean).join('_')
  const criteria = {
    ...(!ambiguousMoney && !(firstCome && lottery) && key !== ''
      ? {
          [key]: `${paymentLabel.length > 0 ? `${paymentLabel}条件を満たした方に` : ''}${suffix}で対象物を提供（本文の条件だけを適用）`
        }
      : {}),
    ...(!ambiguousMoney && !purchase && !charge && !firstCome && !lottery && everyone
      ? { everyone: '来店者・希望者全員に提供' }
      : {}),
    none: '本文から条件を確定できない'
  }
  const amountQuestion = (kind: 'purchase' | 'charge', amounts: number[]): ClefRequest['questions'] =>
    amounts.length === 0
      ? {}
      : {
          [`${kind}_amount`]: {
            type: 'choice',
            instructions:
              kind === 'purchase'
                ? '対象物を受け取るための商品購入金額の下限はどれですか？ 入金・チャージ金額や商品価格を選ばないでください。'
                : '対象物を受け取るための入金・チャージ金額の下限はどれですか？ 商品購入金額や商品価格を選ばないでください。',
            criteria: {
              ...Object.fromEntries(amounts.slice(0, 254).map((amount) => [`p${amount}`, `${amount}円`])),
              none: kind === 'purchase' ? '本文から購入金額を確定できない' : '本文から入金・チャージ金額を確定できない'
            }
          }
        }
  return {
    ...(Object.keys(criteria).length > 1
      ? {
          condition: {
            type: 'choice' as const,
            instructions:
              '本文で明示された入手条件はどれですか？ 商品購入と入金・チャージは別条件です。単なる販売価格や決済方法を条件とみなさず、本文に条件がなければnoneを選んでください。',
            criteria
          }
        }
      : {}),
    ...amountQuestion('purchase', amountsOf(text, purchasePatterns)),
    ...amountQuestion('charge', amountsOf(text, chargePatterns))
  }
}

export const requiresPurchase = (condition: string | undefined): boolean => condition?.includes('purchase') === true
export const requiresCharge = (condition: string | undefined): boolean => condition?.includes('charge') === true
