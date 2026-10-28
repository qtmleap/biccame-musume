import { z } from 'zod'
import { isConfirmKey } from './association-confirm'
import { ASSOCIATION_NONE, associatedCharacterIds, associationIds, selectedStores } from './associations'
import { type ClefAnswer, type ClefRequest, type ClefResponse, ClefResponseSchema } from './clef'
import { keyToDate, keyToQuantity, QUESTION_VERSION } from './decide'
import { decideAssociations } from './detection-association'
import { draftCharacterIds } from './detection-character'
import {
  conditionQuestions,
  hasAmbiguousMoney,
  hasFirstComeAndLottery,
  hasUnsupportedCondition,
  requiresCharge,
  requiresPurchase
} from './detection-conditions'
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
import type { DetectPost } from './post'

// Worker 側は、dev サーバーが起動時の package.json の exports を保持するため、新しいサブパスを作らずここから import する。
export { confirmTargetOf, createConfirmRequest, hasConfirmTarget } from './association-confirm'
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
  CHARACTER_CONFIRM_THRESHOLD,
  CHARACTER_DEFAULT_THRESHOLD,
  DEFAULT_DETECTION_THRESHOLDS,
  type DetectionThresholds,
  DetectionThresholdsSchema,
  FIELD_THRESHOLD_KEYS,
  type FieldThresholdKey,
  type FieldThresholds,
  FieldThresholdsSchema,
  resolveFieldThresholds,
  STATUS_DEFAULT_THRESHOLD,
  STORE_CONFIRM_THRESHOLD,
  STORE_DEFAULT_THRESHOLD,
  StoredFieldThresholdsSchema,
  thresholdOf
} from './detection-thresholds'
export {
  createLinkedEventRequest,
  isLinkedEventAction,
  isLinkedEventQuestion,
  LINKED_EVENT_INSTRUCTIONS,
  LINKED_EVENT_MAX_OPTIONS,
  LINKED_EVENT_QUESTION_KEY,
  type LinkableEvent,
  linkedEventOptions,
  linkedEventProposalOf,
  linkedEventTargetStore,
  postAccountStore
} from './linked-event'

// v17: 娘の質問に store_character（本文でビッカメ娘に特に言及がなければ開催店舗の娘）を足し、「店舗の娘と同一と仮定しない」注意書きを外した。
// 店舗の質問と2段目（選んだ最上位の店舗・娘ごとの「はい/いいえ」の確認。v16 で追加）の質問は v16 と同一。
export const DETECTION_VERSION = `${QUESTION_VERSION}-webhook-v17-store-character`
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
    // 確認の質問の回答の欠落だけは例外にせず、下で確認が通らない（保留）扱いにする。型が違う回答は他の質問と同じく不正。
    if (answer === undefined && isConfirmKey(key)) continue
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
/** しきい値を適用しない最有力候補（argmax）。回答が無い・型が違う場合は undefined。 */
const argmaxOf = (answer: ClefAnswer | undefined) => (answer?.type === 'choice' ? answer.choice : undefined)
const keyToAmount = (key: string | undefined) => (key && /^p\d+$/.test(key) ? Number(key.slice(1)) : undefined)
const keyToOptionalQuantity = (key: string | undefined) => (key && key !== 'none' ? keyToQuantity(key) : undefined)

/**
 * 配布条件を書いていない投稿は、条件なし＝全員への配布とみなす（D1 の人手修正済みイベントも条件を書かないものは全員として登録されている）。
 * 条件の質問が作られなかった投稿（questionAsked が偽）にだけ適用する。質問があって none の投稿は「判断できない」であって条件なしではない。
 * 「円以上」だけの曖昧な金額、先着と抽選の両方の語（質問を作れない）、会員・提示などモデルに載っていない条件の語がある投稿は、全員とみなさず人が確認する。
 */
const impliesEveryone = (post: DetectPost, questionAsked: boolean) =>
  !questionAsked && !hasAmbiguousMoney(post) && !hasFirstComeAndLottery(post) && !hasUnsupportedCondition(post)

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

/**
 * 自動登録に進める配布条件の組み合わせ。D1 の人手修正済みイベントで、全項目が一致して登録できた条件はこの 2 形が大半を占める。
 *  - 全員（[everyone] のみ）
 *  - 購入（購入金額あり）と先着（配布数あり）の 2 件ちょうど
 * 購入のみ・先着のみ・配布数なしの先着・購入と全員の併記などは、正解と食い違うことが多いので人が確認する。
 */
const hasRegistrableConditionPattern = (conditions: readonly Condition[]): boolean => {
  if (conditions.length === 1) return conditions[0].type === 'everyone'
  if (conditions.length !== 2) return false
  const purchase = conditions.find((condition) => condition.type === 'purchase')
  const firstCome = conditions.find((condition) => condition.type === 'first_come')
  return purchase?.purchaseAmount !== undefined && firstCome?.quantity !== undefined
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
  // 店舗とビッカメ娘は choice 1 問ずつ。両方が none を共通のしきい値（fieldThreshold）以上で選んだときだけ、ビッカメ娘の企画ではないとして対象外にする。
  // 採用の下限（下の store / character）は最上位を採るために低く、それで対象外にすると確信の低い none で投稿を捨ててしまうので、対象外には使わない。
  // 片方だけ none の投稿は、下の store_unconfirmed / character_unconfirmed で保留になる。
  if (
    choiceOf(answers.store, settings.data.fieldThreshold) === ASSOCIATION_NONE &&
    choiceOf(answers.character, settings.data.fieldThreshold) === ASSOCIATION_NONE
  )
    return { status: 'ignored', confidence, reasons: ['not_distribution_event'] }
  // 開催店舗とビッカメ娘は、選択肢が多くて確率が散る。最上位の確率が 70% 以上なら 2 段目の確認なしで確定し、70% 未満なら 2 段目の確認
  // （はい/いいえ）の「はい」が下限以上のときだけ確定する（detection-association.ts）。確認の質問を送っていない保存データ（v15 以前）の 70% 未満は確定しない。
  // multiple・none は確率が高くても採用されず保留になる。下限は thresholdOf を通す値（既定 70%。管理画面で保存した値が優先する）で、確認の対象選択（confirmTargetOf）も同じ値を使う。
  const { stores, characterIds, storeConfirmLow, characterConfirmLow } = decideAssociations(
    request,
    answers,
    settings.data
  )
  const status = choiceOf(answers.status, thresholdFor('status'))
  const category = CategorySchema.safeParse(choiceOf(answers.category, thresholdFor('category')))
  const start = choiceOf(answers.start_date, thresholdFor('start_date'))
  const startDate = start ? keyToDate(start) : undefined
  // 終了日は最有力が none（記載なし・「なくなり次第終了」など）なら、確率がしきい値未満でも「終了日なし」で確定する。
  // 最有力が具体的な日付のときは、他の項目と同じくしきい値以上を要求する。answer-view.ts の describeAnswer と揃える。
  const endAnswer = answers.end_date
  const endIsNone = endAnswer?.type === 'choice' && endAnswer.choice === 'none'
  const end = choiceOf(endAnswer, thresholdFor('end_date'))
  const endDate = end && end !== 'none' ? keyToDate(end) : undefined
  // 送った request に条件の質問が無く、応答にも条件の回答が無い投稿は、本文に配布条件の記載が無いものとして全員配布とみなす。
  // 本文から質問を作り直さず、実際に送った request で判断する（版が古い保存データでも同じ）。
  const conditionAsked = request.questions.condition !== undefined || answers.condition !== undefined
  const condition = impliesEveryone(post, conditionAsked)
    ? 'everyone'
    : choiceOf(answers.condition, thresholdFor('condition'))
  const amountKey = choiceOf(answers.purchase_amount, thresholdFor('purchase_amount'))
  const amount = keyToAmount(amountKey)
  const quantityKey = choiceOf(answers.quantity, thresholdFor('quantity'))
  const quantity = keyToOptionalQuantity(quantityKey)
  const purchaseRequired = requiresPurchase(condition)
  const chargeRequired = requiresCharge(condition)
  const chargeAmount = keyToAmount(choiceOf(answers.charge_amount, thresholdFor('charge_amount')))
  const unsupportedCondition = hasUnsupportedCondition(post)
  const statusReason =
    status === 'ongoing' ? 'existing_event_update' : status === 'end' ? 'event_ended' : 'status_unconfirmed'
  const itemUnspecified = choiceOf(answers.category, thresholdFor('category')) === 'none'
  const conditions = buildConditions(condition, amount, quantity, chargeAmount)
  const newAnnouncement = status === 'announce' || status === 'start'
  // 自動登録の精度のための保留規則（D1 の Golden で検証済み）。新規の告知・開始だけに付け、継続・終了の投稿には付けない。
  // 規則は 3 つ: 配布条件の組み合わせ（COND）・抽出段階の店舗が未特定（ESN）・入金・チャージ条件（CHG）。
  // 名刺で終了日が無い候補を保留にする規則（END）も試したが、止めた不正解が失った正解の 2 倍に届かず、外した（docs/event-detection-golden.md）。
  // 上の理由と併記する。条件がまだ確定していない（conditions が空）・購入額が未確定のときは、先の distribution_condition_* / purchase_amount_unconfirmed に任せて、条件の組み合わせの規則は付けない。
  const gateReasons = newAnnouncement
    ? [
        ...(conditions.length > 0 &&
        !(purchaseRequired && amount === undefined) &&
        !hasRegistrableConditionPattern(conditions)
          ? ['condition_pattern_unconfirmed']
          : []),
        ...(chargeRequired ? ['charge_condition_unconfirmed'] : []),
        ...(storeKey === null ? ['extraction_store_unspecified'] : [])
      ]
    : []
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
    // 確認を聞いて通らなかったときは、確定できない理由（上の store_unconfirmed）に、確認の「はい」の確率が下限未満だったことを足す。
    ...(storeConfirmLow ? ['store_confirm_low'] : []),
    ...(characterIds.length === 0 ? ['character_unconfirmed'] : []),
    // 確認が低くても、店舗の娘として登録に進むときは保留ではないので付けない。店舗が採用されず保留のときだけ併記する。
    ...(characterConfirmLow && characterIds.length === 0 ? ['character_confirm_low'] : []),
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
    ...(chargeRequired && chargeAmount === undefined ? ['charge_amount_unconfirmed'] : []),
    ...gateReasons
  ]
  if (
    reasons.length > 0 ||
    !category.success ||
    stores.length === 0 ||
    !startDate ||
    (status !== 'announce' && status !== 'start')
  )
    return { status: 'held', confidence, reasons }
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
export const buildDetectionDraft = (post: DetectPost, answers: ClefResponse['answers']): DetectionDraft => {
  const category = draftCategory(answers.category)
  // 下書きでも開催店舗から対象キャラクターを推測しない（v17 の store_character が最上位のときだけ、下書きの店舗の娘）。版ごとに回答の形が違うため、キーの有無で読み分ける。
  //  v2: store（choice）／v3〜v12: venue.* と character.*（noul）／v13 以降（v14〜v17 を含む）: store と character（choice）
  const keys = Object.keys(answers)
  const stores = keys.some((key) => key.startsWith('venue.'))
    ? associationIds(answers, 'venue', 0.5)
    : selectedStores(argmaxOf(answers.store))
  const characterIds = keys.some((key) => key.startsWith('character.'))
    ? associatedCharacterIds(answers, 0.5)
    : draftCharacterIds(argmaxOf(answers.character), stores)
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
    // 条件の質問が無かった本文は、登録判定と同じ規則で全員配布を下書きに入れる。下書きは送った request を持たないため、
    // 回答に condition が無く、現行の本文からも条件の質問が作られないときだけ「質問が無かった」とみなす。
    // 回答が1件も無い（判定が行われていない）下書きと、回答が欠けただけの投稿は、全員とみなさない。
    conditions: buildConditions(
      impliesEveryone(
        post,
        keys.length === 0 || answers.condition !== undefined || conditionQuestions(post).condition !== undefined
      )
        ? 'everyone'
        : argmaxOf(answers.condition),
      amount,
      quantity,
      chargeAmount
    ),
    ...(quantity !== undefined ? { limitedQuantity: quantity } : {})
  }
}
