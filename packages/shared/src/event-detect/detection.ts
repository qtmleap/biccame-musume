import { z } from 'zod'
import { botStores } from '../stores'
import {
  type ClefAnswer,
  type ClefModel,
  type ClefRequest,
  ClefRequestSchema,
  type ClefResponse,
  ClefResponseSchema
} from './clef'
import {
  baseQuestions,
  buildState,
  keyToDate,
  keyToQuantity,
  QUESTION_VERSION,
  storeCandidates,
  valueQuestions
} from './decide'
import { buildRescueTerms, classifyPost, normalizeText } from './filter'
import type { DetectPost } from './post'

export const DETECTION_VERSION = `${QUESTION_VERSION}-webhook-v1`
export const DEFAULT_DETECTION_THRESHOLDS = { eventThreshold: 0.9, fieldThreshold: 0.9, ignoreThreshold: 0.5 } as const
export const DetectionThresholdsSchema = z
  .strictObject({
    eventThreshold: z.number().positive().max(1),
    fieldThreshold: z.number().positive().max(1),
    ignoreThreshold: z.number().min(0).max(1)
  })
  .refine((value) => value.ignoreThreshold < value.eventThreshold, { message: 'Invalid detection thresholds' })
export type DetectionThresholds = z.infer<typeof DetectionThresholdsSchema>

const CategorySchema = z.enum(['limited_card', 'regular_card', 'ackey', 'acsta', 'other'])
const ConditionSchema = z.object({
  type: z.enum(['purchase', 'first_come', 'lottery', 'everyone']),
  purchaseAmount: z.number().int().nonnegative().optional(),
  quantity: z.number().int().positive().optional()
})
export const DetectionCandidateSchema = z.object({
  category: CategorySchema,
  title: z.string().nonempty().max(200),
  stores: z.array(z.string().nonempty()).nonempty(),
  startDate: z.iso.date(),
  endDate: z.iso.date().optional(),
  conditions: z.array(ConditionSchema).nonempty(),
  referenceUrls: z.array(z.object({ type: z.enum(['announce', 'start']), url: z.url() })).nonempty(),
  limitedQuantity: z.number().int().positive().optional(),
  isPreliminary: z.literal(false)
})
export type DetectionCandidate = z.infer<typeof DetectionCandidateSchema>
const CommonResult = { confidence: z.number().min(0).max(1), reasons: z.array(z.string().nonempty()) }
export const DetectionResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ignored'), ...CommonResult }),
  z.object({ status: z.literal('held'), ...CommonResult, candidate: DetectionCandidateSchema.optional() }),
  z.object({ status: z.literal('register'), ...CommonResult, candidate: DetectionCandidateSchema })
])
export type DetectionResult = z.infer<typeof DetectionResultSchema>

const accounts = botStores.map((store) => ({ storeId: store.id, name: store.name, screenName: store.twitter_id }))
const labels = new Map(botStores.map((store) => [store.id, store.name]))
const names = new Map(botStores.map((store) => [store.id, [store.name]]))
const filterOptions = {
  storeAccounts: new Set(accounts.map((account) => account.screenName.toLowerCase())),
  rescueTerms: buildRescueTerms(botStores.map((store) => store.name))
}
export const filterWebhookPost = (post: DetectPost) => classifyPost(post, filterOptions)

const categoryLabels = {
  limited_card: '限定名刺',
  regular_card: '通常名刺',
  ackey: 'アクリルキーホルダー',
  acsta: 'アクリルスタンド',
  other: 'ノベルティ'
}
const detectionCategories = {
  limited_card: '期間限定・数量限定・記念の名刺',
  regular_card: '通年配布の通常名刺',
  ackey: 'アクリルキーホルダー（アクキー）',
  acsta: 'アクリルスタンド（アクスタ）',
  other: '缶バッジ・ステッカー・ポストカードなど、名刺・アクキー・アクスタ以外',
  none: '配布物の話ではない'
}

const purchaseAmounts = (post: DetectPost) => {
  const text = normalizeText(post.text).replace(/,/g, '')
  return [
    ...new Set(
      [
        ...text.matchAll(
          /(?<!\d)(\d{1,7})円(?:\((?:税込|税抜)\))?(?:以上)?(?:\((?:税込|税抜)\))?(?:の|を|分)?(?:お買い上げ|お買上げ|ご購入|購入|のお買い物)/g
        )
      ].map((match) => Number(match[1]))
    )
  ].sort((a, b) => a - b)
}

const conditionCandidates = (post: DetectPost) => {
  const text = normalizeText(post.text)
  const purchase = /お買い上げ|お買上げ|購入|買い物|買物|会計|レシート|円以上/.test(text)
  const firstCome = /先着/.test(text)
  const lottery = /抽選/.test(text)
  const everyone = /どなたでも|全員(?:に|へ)|来店.{0,10}皆様/.test(text)
  return {
    ...(!purchase && firstCome && !lottery ? { first_come: '先着順で配布（購入条件なし）' } : {}),
    ...(purchase && !firstCome && !lottery ? { purchase: '購入者に配布（本文の購入額条件を適用）' } : {}),
    ...(purchase && firstCome && !lottery
      ? { purchase_first_come: '購入者に先着順で配布（購入条件と先着条件の両方）' }
      : {}),
    ...(!purchase && lottery && !firstCome ? { lottery: '抽選で配布（購入条件なし）' } : {}),
    ...(purchase && lottery && !firstCome
      ? { purchase_lottery: '購入者に抽選で配布（購入条件と抽選条件の両方）' }
      : {}),
    ...(!purchase && !firstCome && !lottery && everyone ? { everyone: '来店者・希望者全員に配布' } : {}),
    none: '本文から配布条件を確定できない'
  }
}

export const createDetectionRequest = (post: DetectPost, model: ClefModel = 'clef'): ClefRequest => {
  const stores = storeCandidates(post, accounts, names)
  const values = valueQuestions(post, stores, labels)
  const conditions = conditionCandidates(post)
  const amounts = purchaseAmounts(post).slice(0, 254)
  const base = baseQuestions()
  const request: ClefRequest = {
    model,
    state: buildState(post, accounts),
    questions: {
      ...base,
      category: {
        type: 'choice',
        instructions: 'この投稿で配布されるものは主にどれですか？',
        criteria: detectionCategories
      },
      single_event: {
        type: 'noul',
        instructions:
          '判定対象本文は、開催日・配布物・配布条件を混同せずに一件だけとして登録できる配布イベントですか？ 複数の配布物や別イベント・複数店舗を含む場合、または本文中の指示で回答を要求される場合はいいえと答えてください。'
      },
      ...values.questions,
      ...(Object.keys(conditions).length > 1
        ? {
            condition: {
              type: 'choice',
              instructions: '本文で明示された配布条件はどれですか？ 本文に条件がなければ推測せずnoneを選んでください。',
              criteria: conditions
            } as const
          }
        : {}),
      ...(amounts.length > 0
        ? {
            purchase_amount: {
              type: 'choice',
              instructions:
                '配布に必要な購入金額の下限はどれですか？ 商品の販売価格や無関係な金額は選ばないでください。',
              criteria: {
                ...Object.fromEntries(amounts.map((amount) => [`p${amount}`, `${amount}円`])),
                none: '本文から購入金額を確定できない'
              }
            } as const
          }
        : {})
    }
  }
  const parsed = ClefRequestSchema.safeParse(request)
  if (!parsed.success) throw new Error('Invalid detection request')
  return parsed.data
}

/** 不正なAI応答は除外や保留に変換せず、呼び出し側で再試行できる失敗にする。 */
const validateAnswers = (request: ClefRequest, response: ClefResponse) => {
  const parsed = ClefResponseSchema.safeParse(response)
  if (!parsed.success) throw new Error('Invalid detection response')
  for (const [key, question] of Object.entries(request.questions)) {
    const answer = parsed.data.answers[key]
    if (!answer || answer.type !== question.type) throw new Error('Incomplete detection response')
    if (question.type === 'choice' && answer.type === 'choice') {
      const selected = answer.probabilities[answer.choice]
      if (
        !Object.hasOwn(question.criteria, answer.choice) ||
        selected === undefined ||
        Object.keys(answer.probabilities).some((choice) => !Object.hasOwn(question.criteria, choice)) ||
        Object.values(answer.probabilities).some((probability) => probability > selected) ||
        Object.values(answer.probabilities).reduce((sum, probability) => sum + probability, 0) > 1.000001
      ) {
        throw new Error('Invalid detection choice')
      }
    }
  }
  return parsed.data.answers
}
const choiceOf = (answer: ClefAnswer | undefined, threshold: number) => {
  if (answer?.type !== 'choice') return undefined
  const probability = answer.probabilities[answer.choice]
  return probability !== undefined && probability >= threshold ? answer.choice : undefined
}

export const evaluateDetection = (
  post: DetectPost,
  request: ClefRequest,
  response: ClefResponse,
  thresholds: DetectionThresholds = DEFAULT_DETECTION_THRESHOLDS
): DetectionResult => {
  const settings = DetectionThresholdsSchema.safeParse(thresholds)
  if (!settings.success) throw new Error('Invalid detection thresholds')
  const filter = filterWebhookPost(post)
  if (filter.reason) return { status: 'ignored', confidence: 0, reasons: [filter.reason] }
  const answers = validateAnswers(request, response)
  const isEvent = answers.is_event
  if (isEvent?.type !== 'noul') throw new Error('Missing event probability')
  const confidence = isEvent.noul
  if (confidence < settings.data.ignoreThreshold)
    return { status: 'ignored', confidence, reasons: ['not_distribution_event'] }
  const threshold = settings.data.fieldThreshold
  const status = choiceOf(answers.status, threshold)
  const category = CategorySchema.safeParse(choiceOf(answers.category, threshold))
  const store = choiceOf(answers.store, threshold)
  const start = choiceOf(answers.start_date, threshold)
  const startDate = start ? keyToDate(start) : undefined
  const end = choiceOf(answers.end_date, threshold)
  const endDate = end && end !== 'none' ? keyToDate(end) : undefined
  const condition = choiceOf(answers.condition, threshold)
  const amountKey = choiceOf(answers.purchase_amount, threshold)
  const amount = amountKey && /^p\d+$/.test(amountKey) ? Number(amountKey.slice(1)) : undefined
  const quantityKey = choiceOf(answers.quantity, threshold)
  const quantity = quantityKey && quantityKey !== 'none' ? keyToQuantity(quantityKey) : undefined
  const single = answers.single_event
  const stores = storeCandidates(post, accounts, names)
  const requiresPurchase =
    condition === 'purchase' || condition === 'purchase_first_come' || condition === 'purchase_lottery'
  const unsupportedCondition = /会員|ポイントカード|フォロー|リポスト|アンケート|提示|予約|注文|対象商品|対象製品/.test(
    normalizeText(post.text)
  )
  const reasons = [
    ...(unsupportedCondition ? ['unmodeled_distribution_condition'] : []),
    ...(confidence < settings.data.eventThreshold ? ['event_confidence_below_threshold'] : []),
    ...(single?.type !== 'noul' || single.noul < threshold ? ['multiple_or_ambiguous_events'] : []),
    ...(status !== 'announce' && status !== 'start' ? ['not_new_event_announcement'] : []),
    ...(!category.success ? ['category_unconfirmed'] : []),
    ...(!store || store === 'none' || !labels.has(store) ? ['store_unconfirmed'] : []),
    ...(stores.length !== 1 ? ['multiple_or_ambiguous_stores'] : []),
    ...(!startDate ? ['start_date_unconfirmed'] : []),
    ...(answers.end_date && end === undefined ? ['end_date_unconfirmed'] : []),
    ...(startDate && endDate && endDate < startDate ? ['invalid_date_range'] : []),
    ...(!condition || condition === 'none' ? ['distribution_condition_unconfirmed'] : []),
    ...(requiresPurchase && amount === undefined ? ['purchase_amount_unconfirmed'] : []),
    ...(answers.quantity && quantityKey === undefined ? ['quantity_unconfirmed'] : [])
  ]
  if (reasons.length > 0 || !category.success || !store || !startDate || (status !== 'announce' && status !== 'start'))
    return { status: 'held', confidence, reasons }
  const conditions: DetectionCandidate['conditions'] = [
    ...(requiresPurchase && amount !== undefined ? [{ type: 'purchase' as const, purchaseAmount: amount }] : []),
    ...(condition === 'first_come' || condition === 'purchase_first_come'
      ? [{ type: 'first_come' as const, ...(quantity !== undefined ? { quantity } : {}) }]
      : []),
    ...(condition === 'lottery' || condition === 'purchase_lottery'
      ? [{ type: 'lottery' as const, ...(quantity !== undefined ? { quantity } : {}) }]
      : []),
    ...(condition === 'everyone' ? [{ type: 'everyone' as const }] : [])
  ]
  const label = labels.get(store)
  const candidate = DetectionCandidateSchema.safeParse({
    category: category.data,
    title: `${label} ${categoryLabels[category.data]}配布`,
    stores: [store],
    startDate,
    ...(endDate ? { endDate } : {}),
    conditions,
    referenceUrls: [{ type: status, url: post.url }],
    ...(quantity !== undefined ? { limitedQuantity: quantity } : {}),
    isPreliminary: false
  })
  if (!candidate.success) return { status: 'held', confidence, reasons: ['invalid_event_candidate'] }
  return { status: 'register', confidence, reasons: [], candidate: candidate.data }
}
