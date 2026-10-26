import dayjs from 'dayjs'
import type { ClefAnswer, ClefRequest, ClefResponse } from './clef'
import {
  createDetectionRequests,
  DEFAULT_DETECTION_THRESHOLDS,
  type DetectionThresholds,
  evaluateDetection,
  thresholdOf
} from './detection'
import type { DetectPost } from './post'

/** 既定の設定での 1 段目の下限（これ以上なら 2 段目の確認を聞かずに確定する）。confirmTargetOf に渡す。 */
export const choiceThresholds = (thresholds: DetectionThresholds = DEFAULT_DETECTION_THRESHOLDS) => ({
  store: thresholdOf(thresholds, 'store'),
  character: thresholdOf(thresholds, 'character')
})

export const post = (
  text = 'あべのたん限定名刺 2026年11月3日から1,000円以上お買い上げの方に先着100枚を配布します',
  overrides: Partial<DetectPost> = {}
): DetectPost => ({
  id: '2109221721773576390',
  createdAt: '2026-10-11T01:00:00.000Z',
  screenName: 'bic_abeno',
  kind: 'original',
  text,
  url: 'https://x.com/bic_abeno/status/2109221721773576390',
  media: [],
  ...overrides
})
export const requestWithAssociations = (
  value: DetectPost,
  model: 'clef' | 'clef-flash' = 'clef',
  storeKey: string | null = null
): ClefRequest => {
  const requests = createDetectionRequests(value, model, storeKey)
  return {
    model,
    state: requests[0].state,
    questions: Object.assign({}, ...requests.map((request) => request.questions))
  }
}
export const response = (request: ClefRequest, overrides: Record<string, ClefAnswer> = {}): ClefResponse => {
  // 投稿者の店舗（state の「投稿者」の行）が開催店舗でも対象ビッカメ娘でもあるものとして答える。
  // 店舗名の書式（v14 までは「店舗名（店舗ID）」、v15 からは短い店舗名）に依らないよう、行頭の投稿者のアカウント名で見分ける。
  const own = request.state.includes(`投稿者: @${shintouOverrides.screenName} /`) ? 'shintou' : 'abeno'
  // 選択肢にあるものを先頭から選ぶ。保留規則（条件は全員か購入＋先着）を通る値を先に置き、無ければ従来の値にする。
  const selected: Record<string, string[]> = {
    status: ['announce'],
    category: ['limited_card'],
    store: [own],
    character: [own],
    start_date: ['d20261103'],
    end_date: ['none'],
    condition: ['purchase_first_come', 'first_come'],
    quantity: ['q100'],
    purchase_amount: ['p1000']
  }
  const answers = Object.fromEntries(
    Object.entries(request.questions).map(([key, question]): [string, ClefAnswer] => {
      if (question.type === 'noul') return [key, { type: 'noul', noul: 0.99 }]
      if (question.type !== 'choice') throw new Error('Unexpected test question')
      const wanted = Object.hasOwn(selected, key) ? selected[key] : []
      const choice = wanted.find((candidate) => Object.hasOwn(question.criteria, candidate))
      if (!choice) return [key, { type: 'choice', choice: 'none', probabilities: { none: 0.99 } }]
      return [key, { type: 'choice', choice, probabilities: { [choice]: 0.99 }, confidence: 0.01 }]
    })
  )
  return { answers: { ...answers, ...overrides } }
}
/**
 * evaluateDetection を、抽出段階の開催店舗候補（storeKey）が選ばれた店舗と同じ前提で呼ぶ。
 * storeKey が null だと保留規則（extraction_store_unspecified）で全て保留になるため、ESN を検証する以外のテストはこちらを使う。
 * 店舗が選ばれていない（none など）ときは投稿元の abeno を候補とし、storeKey を渡せばそれを優先する。
 */
export const evaluateWithStore = (
  value: DetectPost,
  request: ClefRequest,
  result: ClefResponse,
  thresholds?: DetectionThresholds,
  storeKey?: string | null
) => {
  const store = result.answers.store
  const selected =
    store?.type === 'choice' && store.choice !== 'none' && store.choice !== 'multiple' ? store.choice : 'abeno'
  return evaluateDetection(value, request, result, thresholds, storeKey === undefined ? selected : storeKey)
}
export const payload = (iso = '2026-10-11T01:00:00.000Z') => {
  const id = (((BigInt(dayjs(iso).valueOf()) - 1_288_834_974_657n) << 22n) + 123n).toString()
  return {
    body: 'あべのたん名刺配布✨',
    tag: `tweet-${id}`,
    timestamp: '1',
    registration_ids: ['synthetic-subscription-not-saved'],
    icon: 'https://example.com/unused.png',
    data: {
      body: 'あべのたん名刺配布✨',
      tag: `tweet-${id}`,
      type: 'tweet',
      uri: `/bic_abeno/status/${id}`,
      ignored: 'not-saved'
    }
  }
}
export const now = dayjs('2026-10-11T02:00:00.000Z').valueOf()

export const choice = (selected: string, probabilities: Record<string, number>): ClefAnswer => ({
  type: 'choice',
  choice: selected,
  probabilities
})
export const categoryCriteria = (request: ClefRequest) => {
  const question = request.questions.category
  if (question?.type !== 'choice') throw new Error('Missing category question')
  return question.criteria
}
// 新東たんの「アクリルコースタープレゼント」を想定した、しきい値に届かない回答。
export const shintouPost = post(
  '【擬人化６周年イベント】10/19(月)から、1,000円以上お買い上げの方にアクリルコースターをプレゼント！数量限定100個',
  { screenName: 'Bic_shintoueki', createdAt: '2026-10-16T01:00:00.000Z' }
)
export const shintouPostText =
  '🎃新東たん擬人化６周年イベント🎃\n日付：10月19日（月）～なくなり次第終了\n枚数：限定60枚\n※5,000円以上お買い物でお一人様一枚まで\nアクリルコースタープレゼント🎁'
export const shintouOverrides = { screenName: 'Bic_shintoueki', createdAt: '2026-10-16T01:00:00.000Z' }
export const shintouAnswers = (request: ClefRequest): Record<string, ClefAnswer> => ({
  ...response(request).answers,
  status: choice('announce', { announce: 0.7499, start: 0.2 }),
  category: choice('acsta', { acsta: 0.45, ackey: 0.43, other: 0.02 }),
  store: choice('shintou', { shintou: 0.95, none: 0.03 }),
  character: choice('shintou', { shintou: 0.95, none: 0.03 }),
  start_date: choice('d20261019', { d20261019: 0.8, none: 0.1 }),
  end_date: choice('none', { none: 0.95 }),
  condition: choice('purchase', { purchase: 0.7, none: 0.2 }),
  purchase_amount: choice('p1000', { p1000: 0.8, none: 0.1 }),
  quantity: choice('q100', { q100: 0.8, none: 0.1 })
})

export const choiceQuestionOf = (request: ClefRequest, key: string) => {
  const question = request.questions[key]
  if (question?.type !== 'choice') throw new Error(`Missing choice question ${key}`)
  return question
}

/** 開催店舗と対象ビッカメ娘の選択（choice 1 問ずつ）。選んだ候補の確率を 0.99 にする（1段目の下限 70% 以上なので、2段目の確認なしで確定する）。 */
export const associationAnswers = (store: string, character: string): Record<string, ClefAnswer> => ({
  store: choice(store, { [store]: 0.99 }),
  character: choice(character, { [character]: 0.99 })
})

/**
 * 1段目の最上位の確率を 70% 未満（既定 60%）にした店舗・娘の選択。2段目の確認の「はい」が採用を決める。
 * 確認の関門（store_confirm_low など）を調べるテストは、確認なしで確定してしまう associationAnswers ではなくこちらを使う。
 */
export const uncertainAnswers = (store: string, character: string, probability = 0.6): Record<string, ClefAnswer> => ({
  store: choice(store, { [store]: probability }),
  character: choice(character, { [character]: probability })
})
