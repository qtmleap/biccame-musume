import { z } from 'zod'
import { STORE_DISPLAY_NAMES } from '../domain/badges/store-display-names'
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
  STATUS_CRITERIA,
  storeCandidates,
  valueQuestions
} from './decide'
import { buildRescueTerms, classifyPost, normalizeText } from './filter'
import type { DetectPost } from './post'

export const DETECTION_VERSION = `${QUESTION_VERSION}-webhook-v3`
export const DEFAULT_DETECTION_THRESHOLDS = { eventThreshold: 0.9, fieldThreshold: 0.9, ignoreThreshold: 0.5 } as const

/** 項目別にしきい値を持てる質問。is_event（eventThreshold）と対象外（ignoreThreshold）は別設定で、ここには含めない。 */
export const FIELD_THRESHOLD_KEYS = [
  'single_event',
  'status',
  'category',
  'store',
  'start_date',
  'end_date',
  'quantity',
  'condition',
  'purchase_amount'
] as const
export type FieldThresholdKey = (typeof FIELD_THRESHOLD_KEYS)[number]
/** 状態（status）の既定のしきい値の上限。Clef は告知を 0.85 前後で止めることが多く、共通値 0.9 だと保留になるため下げる。 */
export const STATUS_DEFAULT_THRESHOLD = 0.8
const FieldThresholdSchema = z.number().positive().max(1)
/** 9項目すべての有効なしきい値。保存・API の形で、1項目でも欠ける・余分なキーがあると不正。 */
export const FieldThresholdsSchema = z.strictObject({
  single_event: FieldThresholdSchema,
  status: FieldThresholdSchema,
  category: FieldThresholdSchema,
  store: FieldThresholdSchema,
  start_date: FieldThresholdSchema,
  end_date: FieldThresholdSchema,
  quantity: FieldThresholdSchema,
  condition: FieldThresholdSchema,
  purchase_amount: FieldThresholdSchema
} satisfies Record<FieldThresholdKey, typeof FieldThresholdSchema>)
export type FieldThresholds = z.infer<typeof FieldThresholdsSchema>

export const DetectionThresholdsSchema = z
  .strictObject({
    eventThreshold: z.number().positive().max(1),
    fieldThreshold: z.number().positive().max(1),
    ignoreThreshold: z.number().min(0).max(1),
    /** 項目別の上書き（任意）。無い項目は resolveFieldThresholds の既定値。 */
    fieldThresholds: FieldThresholdsSchema.partial().optional()
  })
  .refine((value) => value.ignoreThreshold < value.eventThreshold, { message: 'Invalid detection thresholds' })
export type DetectionThresholds = z.infer<typeof DetectionThresholdsSchema>

/**
 * 項目ごとの有効なしきい値。上書きがあればそれ、無ければ既定値。
 * 既定値は status が min(fieldThreshold, STATUS_DEFAULT_THRESHOLD)、他の8項目は fieldThreshold（従来の共通値）。
 */
export const resolveFieldThresholds = (
  fieldThreshold: number,
  overrides?: Partial<Record<FieldThresholdKey, number>>
): FieldThresholds => {
  const pick = (key: FieldThresholdKey, fallback: number): number => {
    const value = overrides === undefined ? undefined : overrides[key]
    return value === undefined ? fallback : value
  }
  return {
    single_event: pick('single_event', fieldThreshold),
    status: pick('status', Math.min(fieldThreshold, STATUS_DEFAULT_THRESHOLD)),
    category: pick('category', fieldThreshold),
    store: pick('store', fieldThreshold),
    start_date: pick('start_date', fieldThreshold),
    end_date: pick('end_date', fieldThreshold),
    quantity: pick('quantity', fieldThreshold),
    condition: pick('condition', fieldThreshold),
    purchase_amount: pick('purchase_amount', fieldThreshold)
  }
}
const isFieldThresholdKey = (key: string): key is FieldThresholdKey =>
  FIELD_THRESHOLD_KEYS.some((value) => value === key)

/**
 * 質問キーに対するしきい値。is_event は eventThreshold、9項目は項目別の有効値、それ以外の未知のキーは fieldThreshold。
 * 判定（evaluateDetection）と管理画面の回答表（describeAnswers）が同じ関数で引き、判定と表示がずれないようにする。
 */
export const thresholdOf = (thresholds: DetectionThresholds, key: string): number => {
  if (key === 'is_event') return thresholds.eventThreshold
  if (!isFieldThresholdKey(key)) return thresholds.fieldThreshold
  return resolveFieldThresholds(thresholds.fieldThreshold, thresholds.fieldThresholds)[key]
}

const CategorySchema = z.enum(['limited_card', 'regular_card', 'ackey', 'acsta', 'other'])
type Category = z.infer<typeof CategorySchema>
const PurchaseAmountSchema = z.number().int().nonnegative()
const QuantitySchema = z.number().int().positive()
const ConditionSchema = z.object({
  type: z.enum(['purchase', 'first_come', 'lottery', 'everyone']),
  purchaseAmount: PurchaseAmountSchema.optional(),
  quantity: QuantitySchema.optional()
})
type Condition = z.infer<typeof ConditionSchema>
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
/** しきい値を適用せず回答の最有力候補だけで作る保留ジョブの下書き。登録候補ではない。 */
export const DetectionDraftSchema = z.object({
  title: z.string().nonempty().max(200).optional(),
  category: CategorySchema.optional(),
  stores: z.array(z.string().nonempty()),
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
  conditions: z.array(ConditionSchema),
  limitedQuantity: QuantitySchema.optional()
})
export type DetectionDraft = z.infer<typeof DetectionDraftSchema>
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
  ackey: 'アクリルキーホルダー（アクキー）。キーホルダー形状のもの。コースター・スタンド・プレートは含まない',
  acsta: 'アクリルスタンド（アクスタ）。立てて飾る形状のもの。コースター・キーホルダー・プレートは含まない',
  other:
    '缶バッジ・ステッカー・ポストカード・アクリルコースター・アクリルプレートなど、名刺・アクキー・アクスタ以外（アクリル製でもキーホルダーとスタンド以外はこちら）',
  none: '配布物の話ではない'
}
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
  ['ackey', /アクキー|キーホルダー/],
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

const purchaseAmounts = (post: DetectPost) => {
  const text = normalizeText(post.text).replace(/,/g, '')
  return [
    ...new Set(
      [
        ...text.matchAll(
          /(?<!\d)(\d{1,7})円(?:\((?:税込|税抜)\))?(?:以上)?(?:\((?:税込|税抜)\))?(?:の|を|分)?(?:お買い上げ|お買上げ|ご購入|購入|お買い物|お買物|買い物|買物)/g
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
  // アカウントから店舗が決まる投稿では、Clef の回答が決定に使われない（none でもその店舗になる）ため質問しない。
  // 表に「未確定」の行が出て誤解を招くことも避ける。valueQuestions は CLI 評価も使うため、ここでだけ除く。
  const valueEntries =
    accountStoreOf(post) === undefined
      ? values.questions
      : Object.fromEntries(Object.entries(values.questions).filter(([key]) => key !== 'store'))
  const conditions = conditionCandidates(post)
  const amounts = purchaseAmounts(post).slice(0, 254)
  const base = baseQuestions()
  const request: ClefRequest = {
    model,
    state: buildState(post, accounts),
    questions: {
      ...base,
      // Webhook 判定で見るのは「ビッカメ娘のイベントか」。配布物の種類は category が別に担当するため、ここでは配布に限定しない。
      is_event: {
        type: 'noul',
        instructions:
          'この投稿は、ビッカメ娘（ビックカメラの店舗擬人化キャラクター）に関するイベント（擬人化記念イベント、名刺・グッズ・ノベルティの配布、コラボ、フェアなど、日時を決めて行う催し）についての投稿ですか？ 通常の商品紹介・家電の宣伝・雑談や、ビッカメ娘と関係ない商品の購入特典・メーカーのキャンペーンは含みません。投稿者の店舗名が「投稿者」の行に書かれている場合、投稿者はその店舗（ビッカメ娘）本人のアカウントです。本文に店舗名・キャラクター名・「ビッカメ娘」の言及が無くても、投稿者の店舗のイベント（記念イベント・配布など）の告知であれば「はい」と答えてください。投稿者が「店舗以外」のときはこの扱いをしません。'
      },
      status: { type: 'choice', instructions: STATUS_INSTRUCTIONS, criteria: { ...STATUS_CRITERIA } },
      category: {
        type: 'choice',
        instructions: 'この投稿で配布されるものは主にどれですか？',
        criteria: categoryCriteriaOf(post)
      },
      single_event: {
        type: 'noul',
        instructions:
          '判定対象本文は、開催日・配布物・配布条件を混同せずに一件だけとして登録できる配布イベントですか？ 複数の配布物や別イベント・複数店舗を含む場合、または本文中の指示で回答を要求される場合はいいえと答えてください。'
      },
      ...valueEntries,
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
const requiresPurchaseOf = (condition: string | undefined) =>
  condition === 'purchase' || condition === 'purchase_first_come' || condition === 'purchase_lottery'
const keyToAmount = (key: string | undefined) => (key && /^p\d+$/.test(key) ? Number(key.slice(1)) : undefined)
const keyToOptionalQuantity = (key: string | undefined) => (key && key !== 'none' ? keyToQuantity(key) : undefined)

// 実店舗名（「◯◯店」）の言及を検出するための辞書。キャラ名は storeCandidates が別に見る。
const displayNames: ReadonlyMap<string, string> = new Map(
  Object.entries(STORE_DISPLAY_NAMES).map(([id, name]) => [id, normalizeText(name)])
)
// 店舗名ではない「◯◯店」。除いたあとに残る「店」だけを他店舗の言及として扱う。
const GENERIC_STORE_WORDS = [
  '本店舗',
  '実店舗',
  '当店',
  '全店',
  '各店',
  'お店',
  '閉店',
  '開店',
  '出店',
  '新店',
  '他店',
  '同店',
  '来店'
]
// 「店」の直後に付いて一般語（店頭・店舗・店内・店員・店長・店名）になる字。
const GENERIC_STORE_SUFFIXES = '頭舗内員長名'
const LETTER_OR_NUMBER = /^[\p{L}\p{N}]$/u
const HIRAGANA = /^\p{Script=Hiragana}$/u

/**
 * 本文に、投稿アカウント自身の店舗以外の「◯◯店」形式の言及があるか。
 * 自店の実店舗名（前に「ビックカメラ」が付く形を含む）と一般語は言及として扱わない。
 * 迷う語は言及ありとして扱う（過剰な保留は従来の挙動と同じで安全）。
 */
const mentionsOtherStore = (post: DetectPost, ownStoreId: string): boolean => {
  const original = normalizeText(post.quoted?.text ? `${post.text}、${post.quoted.text}` : post.text)
  const own = displayNames.get(ownStoreId)
  const withoutOwn = (own === undefined ? original : original.replaceAll(own, '、'))
    .replaceAll('ビックカメラ', '、')
    .replaceAll('ビッグカメラ', '、')
  const text = GENERIC_STORE_WORDS.reduce((current, word) => current.replaceAll(word, '、'), withoutOwn)
  const chars = [...text]
  return chars.some((char, index) => {
    if (char !== '店') return false
    // 直前の連続した文字列（別の「店」や記号までを限度に最大15字）が店舗名の候補。
    const before = chars.slice(0, index).reverse()
    const boundary = before.findIndex((value) => !LETTER_OR_NUMBER.test(value) || value === '店')
    const run = before.slice(0, Math.min(15, boundary === -1 ? before.length : boundary))
    if (run.length === 0) return false
    const next = chars[index + 1]
    if (next === undefined || !GENERIC_STORE_SUFFIXES.includes(next)) return true
    // 店頭・店舗などの一般語。名前らしい（2字以上で、ひらがなで終わらない）直前の語があるときだけ言及とみなす。
    const last = run[0]
    return run.length >= 2 && last !== undefined && !HIRAGANA.test(last)
  })
}

/**
 * 投稿者のアカウントから引いた店舗。アカウントに対応する店舗がちょうど1件で、本文に他店舗の名前
 * （キャラ名・「◯◯店」形式の実店舗名）が出ておらず候補もその1件だけの時に限り返す。
 * 複数店舗のアカウント・対応店舗なし・他店舗の言及があれば undefined。
 */
const accountStoreOf = (post: DetectPost): string | undefined => {
  const own = [
    ...new Set(
      accounts
        .filter((account) => account.screenName.toLowerCase() === post.screenName.toLowerCase())
        .map((account) => account.storeId)
    )
  ]
  const candidates = storeCandidates(post, accounts, names)
  const [only] = own
  if (only === undefined || own.length !== 1 || candidates.length !== 1 || candidates[0] !== only) return undefined
  return mentionsOtherStore(post, only) ? undefined : only
}
/**
 * AIが選んだ店舗が既知の店舗ならそれを使い、そうでなければ（noneやしきい値未満を含む）アカウントの店舗にする。
 * アカウントから補った場合は inferred を true にして、後から見分けられるようにする。
 */
const resolveStore = (post: DetectPost, answered: string | undefined): { store?: string; inferred: boolean } => {
  if (answered !== undefined && labels.has(answered)) return { store: answered, inferred: false }
  const fromAccount = accountStoreOf(post)
  return fromAccount === undefined ? { inferred: false } : { store: fromAccount, inferred: true }
}

/** 配布条件の選択肢と金額・数量から保存用の条件一覧を組み立てる。登録判定と下書きで共有する。 */
const buildConditions = (
  condition: string | undefined,
  amount: number | undefined,
  quantity: number | undefined
): Condition[] => {
  return [
    ...(requiresPurchaseOf(condition) && amount !== undefined
      ? [{ type: 'purchase' as const, purchaseAmount: amount }]
      : []),
    ...(condition === 'first_come' || condition === 'purchase_first_come'
      ? [{ type: 'first_come' as const, ...(quantity !== undefined ? { quantity } : {}) }]
      : []),
    ...(condition === 'lottery' || condition === 'purchase_lottery'
      ? [{ type: 'lottery' as const, ...(quantity !== undefined ? { quantity } : {}) }]
      : []),
    ...(condition === 'everyone' ? [{ type: 'everyone' as const }] : [])
  ]
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
  // 項目ごとのしきい値。answer-view.ts の describeAnswer も同じ thresholdOf で引くので、判定と回答表の確定表示は一致する。
  const thresholdFor = (key: FieldThresholdKey) => thresholdOf(settings.data, key)
  const status = choiceOf(answers.status, thresholdFor('status'))
  const category = CategorySchema.safeParse(choiceOf(answers.category, thresholdFor('category')))
  // 店舗は特に指定がなければ投稿アカウントの店舗とみなす（本文に別店舗の名前がある場合などは保留のまま）。
  const { store, inferred: storeInferred } = resolveStore(post, choiceOf(answers.store, thresholdFor('store')))
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
  const single = answers.single_event
  const stores = storeCandidates(post, accounts, names)
  const requiresPurchase = requiresPurchaseOf(condition)
  const unsupportedCondition = /会員|ポイントカード|フォロー|リポスト|アンケート|提示|予約|注文|対象商品|対象製品/.test(
    normalizeText(post.text)
  )
  const reasons = [
    ...(unsupportedCondition ? ['unmodeled_distribution_condition'] : []),
    ...(confidence < settings.data.eventThreshold ? ['event_confidence_below_threshold'] : []),
    ...(single?.type !== 'noul' || single.noul < thresholdFor('single_event') ? ['multiple_or_ambiguous_events'] : []),
    ...(status !== 'announce' && status !== 'start' ? ['not_new_event_announcement'] : []),
    ...(!category.success ? ['category_unconfirmed'] : []),
    ...(store === undefined ? ['store_unconfirmed'] : []),
    ...(stores.length !== 1 ? ['multiple_or_ambiguous_stores'] : []),
    ...(!startDate ? ['start_date_unconfirmed'] : []),
    ...(endAnswer && !endIsNone && end === undefined ? ['end_date_unconfirmed'] : []),
    ...(startDate && endDate && endDate < startDate ? ['invalid_date_range'] : []),
    ...(!condition || condition === 'none' ? ['distribution_condition_unconfirmed'] : []),
    ...(requiresPurchase && amount === undefined ? ['purchase_amount_unconfirmed'] : []),
    ...(answers.quantity && quantityKey === undefined ? ['quantity_unconfirmed'] : [])
  ]
  if (reasons.length > 0 || !category.success || !store || !startDate || (status !== 'announce' && status !== 'start'))
    return { status: 'held', confidence, reasons }
  const conditions = buildConditions(condition, amount, quantity)
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
  // 店舗を投稿アカウントから補った登録候補には、情報用の理由を付ける（登録可否には影響しない）。
  return {
    status: 'register',
    confidence,
    reasons: storeInferred ? ['store_inferred_from_account'] : [],
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
export const buildDetectionDraft = (post: DetectPost, answers: ClefResponse['answers']): DetectionDraft => {
  const category = draftCategory(answers.category)
  // 店舗は回答が既知の店舗ならそれ、無ければ判定と同じ規則（アカウントの店舗）で決める。
  const resolvedStore = resolveStore(post, argmaxOf(answers.store)).store
  const stores = resolvedStore === undefined ? [] : [resolvedStore]
  const start = argmaxOf(answers.start_date)
  const startDate = validOrUndefined(z.iso.date(), start ? keyToDate(start) : undefined)
  const end = argmaxOf(answers.end_date)
  const parsedEnd = validOrUndefined(z.iso.date(), end ? keyToDate(end) : undefined)
  // 終了日が開始日より前なら、evaluateDetection の invalid_date_range と同じく終了日だけを落とす。
  const endDate = parsedEnd !== undefined && startDate !== undefined && parsedEnd < startDate ? undefined : parsedEnd
  const amount = validOrUndefined(PurchaseAmountSchema, keyToAmount(argmaxOf(answers.purchase_amount)))
  const quantity = validOrUndefined(QuantitySchema, keyToOptionalQuantity(argmaxOf(answers.quantity)))
  const label = resolvedStore === undefined ? undefined : labels.get(resolvedStore)
  // 店舗がちょうど1件の時だけ作る。カテゴリが確定できなければ「店舗名 配布」にとどめる。
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
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
    conditions: buildConditions(argmaxOf(answers.condition), amount, quantity),
    ...(quantity !== undefined ? { limitedQuantity: quantity } : {})
  }
}
