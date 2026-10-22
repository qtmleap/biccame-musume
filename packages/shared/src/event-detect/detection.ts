import { z } from 'zod'
import {
  ASSOCIATION_NONE,
  associatedCharacterIds,
  associationIds,
  CHARACTER_QUESTION_KEY,
  selectedCharacterIds,
  selectedStores
} from './associations'
import { type ClefAnswer, type ClefRequest, type ClefResponse, ClefResponseSchema } from './clef'
import { keyToDate, keyToQuantity, QUESTION_VERSION } from './decide'
import { requiresCharge, requiresPurchase } from './detection-conditions'
import { categoryLabels, filterWebhookPost, labels } from './detection-context'
import {
  type Category,
  CategorySchema,
  type Condition,
  DetectionCandidateSchema,
  type DetectionDraft,
  type DetectionResult,
  PurchaseAmountSchema,
  QuantitySchema
} from './detection-schemas'
import {
  DEFAULT_DETECTION_THRESHOLDS,
  type DetectionThresholds,
  DetectionThresholdsSchema,
  type FieldThresholdKey,
  thresholdOf
} from './detection-thresholds'
import { normalizeText } from './filter'
import type { DetectPost } from './post'

export {
  filterWebhookPost,
  WEBHOOK_KEYWORD_VERDICTS,
  type WebhookKeywordVerdict,
  webhookKeywordVerdict
} from './detection-context'
export { createDetectionRequest, createDetectionRequests } from './detection-requests'
export {
  type DetectionCandidate,
  DetectionCandidateSchema,
  type DetectionDraft,
  DetectionDraftSchema,
  type DetectionResult,
  DetectionResultSchema
} from './detection-schemas'
export {
  DEFAULT_DETECTION_THRESHOLDS,
  type DetectionThresholds,
  DetectionThresholdsSchema,
  FIELD_THRESHOLD_KEYS,
  type FieldThresholdKey,
  type FieldThresholds,
  FieldThresholdsSchema,
  resolveFieldThresholds,
  STATUS_DEFAULT_THRESHOLD,
  thresholdOf
} from './detection-thresholds'

export const DETECTION_VERSION = `${QUESTION_VERSION}-webhook-v15-concise-author`
export {
  type DetectionOutcome,
  DetectionOutcomeSchema,
  describeDetectionOutcome,
  groundedDiscoveryEvidence,
  groundedDiscoveryProof
} from './discovery'

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
const keyToAmount = (key: string | undefined) => (key && /^p\d+$/.test(key) ? Number(key.slice(1)) : undefined)
const keyToOptionalQuantity = (key: string | undefined) => (key && key !== 'none' ? keyToQuantity(key) : undefined)

/** 配布条件の選択肢と金額・数量から保存用の条件一覧を組み立てる。登録判定と下書きで共有する。 */
const buildConditions = (
  condition: string | undefined,
  amount: number | undefined,
  quantity: number | undefined,
  chargeAmount: number | undefined
): Condition[] => {
  return [
    ...(requiresPurchase(condition) && amount !== undefined
      ? [{ type: 'purchase' as const, purchaseAmount: amount }]
      : []),
    ...(requiresCharge(condition) && chargeAmount !== undefined ? [{ type: 'charge' as const, chargeAmount }] : []),
    ...(condition?.endsWith('first_come') === true
      ? [{ type: 'first_come' as const, ...(quantity !== undefined ? { quantity } : {}) }]
      : []),
    ...(condition?.endsWith('lottery') === true
      ? [{ type: 'lottery' as const, ...(quantity !== undefined ? { quantity } : {}) }]
      : []),
    ...(condition === 'everyone' ? [{ type: 'everyone' as const }] : [])
  ]
}

export const evaluateDetection = (
  post: DetectPost,
  request: ClefRequest,
  response: ClefResponse,
  thresholds: DetectionThresholds = DEFAULT_DETECTION_THRESHOLDS,
  storeKey: string | null = null
): DetectionResult => {
  const settings = DetectionThresholdsSchema.safeParse(thresholds)
  if (!settings.success) throw new Error('Invalid detection thresholds')
  const filter = filterWebhookPost(post)
  if (filter.reason) return { status: 'ignored', confidence: 0, reasons: [filter.reason] }
  const answers = validateAnswers(request, response)
  const isEvent = answers.is_event
  if (isEvent?.type !== 'noul') throw new Error('Missing event probability')
  // is_event は参考値。confidence（一覧の並べ替え・ベンチマーク用の P(is_event)）にだけ使い、登録・保留・対象外の判定には使わない。
  const confidence = isEvent.noul
  // 項目ごとのしきい値。answer-view.ts の describeAnswer も同じ thresholdOf で引くので、判定と回答表の確定表示は一致する。
  const thresholdFor = (key: FieldThresholdKey) => thresholdOf(settings.data, key)
  // 店舗とビッカメ娘は choice 1 問ずつ。両方が none をしきい値以上で選んだときだけ、ビッカメ娘の企画ではないとして対象外にする。
  // 片方だけ none の投稿は、下の store_unconfirmed / character_unconfirmed で保留になる。
  const storeChoice = choiceOf(answers.store, thresholdFor('store'))
  const characterChoice = choiceOf(answers.character, thresholdOf(settings.data, CHARACTER_QUESTION_KEY))
  if (storeChoice === ASSOCIATION_NONE && characterChoice === ASSOCIATION_NONE)
    return { status: 'ignored', confidence, reasons: ['not_distribution_event'] }
  const status = choiceOf(answers.status, thresholdFor('status'))
  const category = CategorySchema.safeParse(choiceOf(answers.category, thresholdFor('category')))
  // 登録する店舗・対象ビッカメ娘は選ばれた 1 件まで。共同絵柄（multiple）は人が編集フォームで複数指定する。
  const stores = selectedStores(storeChoice)
  const characterIds = selectedCharacterIds(characterChoice)
  const start = choiceOf(answers.start_date, thresholdFor('start_date'))
  const startDate = start ? keyToDate(start) : undefined
  // 終了日は最有力が none（記載なし・「なくなり次第終了」など）なら、確率がしきい値未満でも「終了日なし」で確定する。
  // 最有力が具体的な日付のときは、他の項目と同じくしきい値以上を要求する。answer-view.ts の describeAnswer と揃える。
  const endAnswer = answers.end_date
  const endIsNone = endAnswer?.type === 'choice' && endAnswer.choice === 'none'
  const end = choiceOf(endAnswer, thresholdFor('end_date'))
  const endDate = end && end !== 'none' ? keyToDate(end) : undefined
  const condition = choiceOf(answers.condition, thresholdFor('condition'))
  const amountKey = choiceOf(answers.purchase_amount, thresholdFor('purchase_amount'))
  const amount = keyToAmount(amountKey)
  const quantityKey = choiceOf(answers.quantity, thresholdFor('quantity'))
  const quantity = keyToOptionalQuantity(quantityKey)
  const purchaseRequired = requiresPurchase(condition)
  const chargeRequired = requiresCharge(condition)
  const chargeAmount = keyToAmount(choiceOf(answers.charge_amount, settings.data.fieldThreshold))
  const unsupportedCondition =
    /会員|ポイントカード|フォロー|リポスト|アンケート|提示|予約|注文|対象商品|対象製品|キーワード|合言葉|あいことば/.test(
      normalizeText(post.text)
    )
  const statusReason =
    status === 'ongoing' ? 'existing_event_update' : status === 'end' ? 'event_ended' : 'status_unconfirmed'
  const itemUnspecified = choiceOf(answers.category, thresholdFor('category')) === 'none'
  const reasons = [
    ...(unsupportedCondition ? ['unmodeled_distribution_condition'] : []),
    ...(status !== 'announce' && status !== 'start' ? [statusReason] : []),
    ...(!category.success ? [itemUnspecified ? 'distribution_item_unspecified' : 'category_unconfirmed'] : []),
    // 抽出段階の開催店舗候補と選ばれた店舗が食い違うときは、どちらが正しいか人が確認する。
    ...(stores.length === 0
      ? ['store_unconfirmed']
      : storeKey !== null && !stores.includes(storeKey)
        ? ['store_mismatch']
        : []),
    ...(characterIds.length === 0 ? ['character_unconfirmed'] : []),
    ...(!startDate
      ? [answers.start_date === undefined || start === 'none' ? 'start_date_unspecified' : 'start_date_unconfirmed']
      : []),
    ...(endAnswer && !endIsNone && end === undefined ? ['end_date_unconfirmed'] : []),
    ...(startDate && endDate && endDate < startDate ? ['invalid_date_range'] : []),
    ...(!condition || condition === 'none'
      ? [
          answers.condition === undefined || condition === 'none'
            ? 'distribution_condition_unspecified'
            : 'distribution_condition_unconfirmed'
        ]
      : []),
    ...(purchaseRequired && amount === undefined ? ['purchase_amount_unconfirmed'] : []),
    ...(chargeRequired && chargeAmount === undefined ? ['charge_amount_unconfirmed'] : [])
  ]
  if (
    reasons.length > 0 ||
    !category.success ||
    stores.length === 0 ||
    !startDate ||
    (status !== 'announce' && status !== 'start')
  )
    return { status: 'held', confidence, reasons }
  const conditions = buildConditions(condition, amount, quantity, chargeAmount)
  const label = stores.map((store) => labels.get(store)).join('・')
  const candidate = DetectionCandidateSchema.safeParse({
    category: category.data,
    title: `${label} ${categoryLabels[category.data]}配布`,
    stores,
    characterIds,
    startDate,
    ...(endDate ? { endDate } : {}),
    conditions,
    referenceUrls: [{ type: status, url: post.url }],
    ...(quantity !== undefined ? { limitedQuantity: quantity } : {}),
    isPreliminary: false
  })
  if (!candidate.success) return { status: 'held', confidence, reasons: ['invalid_event_candidate'] }
  // 開催店舗と対象ビッカメ娘はそれぞれ、しきい値以上で選ばれた 1 件だけを採用する。
  return {
    status: 'register',
    confidence,
    reasons: [],
    candidate: candidate.data
  }
}

/** 不正な保存値は下書きから落とし、一覧全体の表示を壊さないようにスキーマで検証した値だけを返す。 */
const validOrUndefined = <T>(schema: z.ZodType<T>, value: unknown): T | undefined => {
  const parsed = schema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}
/** しきい値を適用しない最有力候補（argmax）。回答が無い・型が違う場合は undefined。 */
const argmaxOf = (answer: ClefAnswer | undefined) => (answer?.type === 'choice' ? answer.choice : undefined)

/** 下書きのカテゴリを採用する最小の確率。過半数に届かない僅差はモデルが決めかねている状態として採用しない。 */
export const DRAFT_CATEGORY_MIN_PROBABILITY = 0.5
const draftCategory = (answer: ClefAnswer | undefined): Category | undefined => {
  if (answer?.type !== 'choice') return undefined
  const probability = answer.probabilities[answer.choice]
  if (probability === undefined || probability < DRAFT_CATEGORY_MIN_PROBABILITY) return undefined
  return validOrUndefined(CategorySchema, answer.choice)
}

/**
 * 保留ジョブの下書きを作る。しきい値を適用せず、各回答の最有力候補から取れた項目だけを埋める。
 * ただしカテゴリは最有力候補の確率が過半数の時だけ採用する（僅差の誤ったカテゴリを下書きに載せない）。
 * 回答が欠けていても投げず、取れない項目は undefined / 空配列にする。evaluateDetection の判定には影響しない。
 */
export const buildDetectionDraft = (_post: DetectPost, answers: ClefResponse['answers']): DetectionDraft => {
  const category = draftCategory(answers.category)
  // 下書きでも開催店舗から対象キャラクターを推測しない。版ごとに回答の形が違うため、キーの有無で読み分ける。
  //  v2: store（choice）／v3〜v12: venue.* と character.*（noul）／v13 以降（v14・v15 を含む）: store と character（choice）
  const keys = Object.keys(answers)
  const stores = keys.some((key) => key.startsWith('venue.'))
    ? associationIds(answers, 'venue', 0.5)
    : selectedStores(argmaxOf(answers.store))
  const characterIds = keys.some((key) => key.startsWith('character.'))
    ? associatedCharacterIds(answers, 0.5)
    : selectedCharacterIds(argmaxOf(answers.character))
  const start = argmaxOf(answers.start_date)
  const startDate = validOrUndefined(z.iso.date(), start ? keyToDate(start) : undefined)
  const end = argmaxOf(answers.end_date)
  const parsedEnd = validOrUndefined(z.iso.date(), end ? keyToDate(end) : undefined)
  // 終了日が開始日より前なら、evaluateDetection の invalid_date_range と同じく終了日だけを落とす。
  const endDate = parsedEnd !== undefined && startDate !== undefined && parsedEnd < startDate ? undefined : parsedEnd
  const amount = validOrUndefined(PurchaseAmountSchema, keyToAmount(argmaxOf(answers.purchase_amount)))
  const quantity = validOrUndefined(QuantitySchema, keyToOptionalQuantity(argmaxOf(answers.quantity)))
  const chargeAmount = validOrUndefined(PurchaseAmountSchema, keyToAmount(argmaxOf(answers.charge_amount)))
  const label = stores.length === 0 ? undefined : stores.map((store) => labels.get(store)).join('・')
  // 判定した開催店舗の名前を使い、カテゴリ未確定なら「店舗名 配布」にとどめる。
  const title =
    label === undefined
      ? undefined
      : category === undefined
        ? `${label} 配布`
        : `${label} ${categoryLabels[category]}配布`
  return {
    ...(title !== undefined ? { title } : {}),
    ...(category !== undefined ? { category } : {}),
    stores,
    characterIds,
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
    conditions: buildConditions(argmaxOf(answers.condition), amount, quantity, chargeAmount),
    ...(quantity !== undefined ? { limitedQuantity: quantity } : {})
  }
}
