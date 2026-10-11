import { createHash } from 'node:crypto'
import type { ClefModel, ClefQuestion, ClefRequest, ClefResponse } from '@biccame/shared/event-detect/clef'
import { ClefResponseSchema } from '@biccame/shared/event-detect/clef'
import { normalizeText } from '@biccame/shared/event-detect/filter'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import type { StoreAccount } from './analysis'
import { eventWindow } from './analysis'
import type { GoldEvent } from './gold'

// Clef に投げる状態（state）と質問を組み立てる。評価（scripts/event-detect.ts eval）と
// 将来の自動検出で同じものを使う。質問を変えたら QUESTION_VERSION を上げてキャッシュを分ける。

export const QUESTION_VERSION = 'v1'

const jstDate = (iso: string) => {
  const date = new Date(Date.parse(iso) + 9 * 3_600_000)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

const jstWeekday = (iso: string) => '日月火水木金土'[new Date(Date.parse(iso) + 9 * 3_600_000).getUTCDay()]

/**
 * 投稿を Clef の state にする。投稿日と投稿者の店舗を添え、引用元の本文も含める。
 */
export const buildState = (post: DetectPost, accounts: readonly StoreAccount[]): string => {
  const own = accounts.filter((account) => account.screenName.toLowerCase() === post.screenName.toLowerCase())
  const author = own.length > 0 ? own.map((account) => `${account.name}（${account.storeId}）`).join('・') : '店舗以外'
  const lines = [
    `投稿日: ${jstDate(post.createdAt)}（${jstWeekday(post.createdAt)}）`,
    `投稿者: @${post.screenName} / ${author}`,
    `画像: ${post.media.length} 枚（画像の内容は含まれない）`,
    '本文:',
    post.text
  ]
  if (post.quoted?.text)
    lines.push('', `引用元 @${post.quoted.screenName ? post.quoted.screenName : '不明'}:`, post.quoted.text)
  return lines.join('\n')
}

export const STATUS_CRITERIA = {
  announce: '配布開始前の告知（明日から・○日から・予告）',
  start: '配布開始の案内（本日から・配布開始しました）',
  ongoing: '配布継続中の案内（まだあります・配布中・残りわずか）',
  end: '配布終了の案内（配布終了・なくなりました・完売・本日まで）',
  none: '配布イベントの状態は伝えていない'
} as const

export const CATEGORY_CRITERIA = {
  limited_card: '期間限定・数量限定・記念の名刺',
  regular_card: '通年配布の通常名刺',
  ackey: 'アクリルキーホルダー（アクキー）',
  other: 'アクスタ・缶バッジ・ステッカー・ポストカードなど名刺とアクキー以外',
  none: '配布物の話ではない'
} as const

/** 投稿 1 件ごとに共通の質問 */
export const baseQuestions = (): Record<string, ClefQuestion> => ({
  is_event: {
    type: 'noul',
    instructions:
      'この投稿は、ビッカメ娘（ビックカメラの店舗擬人化キャラクター）の名刺・アクリルキーホルダー・アクリルスタンド・缶バッジなどのノベルティを配布するイベントについての投稿ですか？ ビッカメ娘と関係ない商品の購入特典やメーカーのキャンペーンは含みません。'
  },
  status: {
    type: 'choice',
    instructions: 'この投稿が伝えている配布イベントの状態はどれですか？',
    criteria: { ...STATUS_CRITERIA }
  },
  category: {
    type: 'choice',
    instructions: 'この投稿で配布されるものは主にどれですか？',
    criteria: { ...CATEGORY_CRITERIA }
  }
})

/**
 * 店舗の候補。投稿者の店舗に加え、本文にキャラ名・店舗名が出る店舗を足す。
 */
export const storeCandidates = (
  post: DetectPost,
  accounts: readonly StoreAccount[],
  storeNames: Map<string, string[]>
) => {
  const text = normalizeText(post.text)
  const own = accounts.filter((account) => account.screenName.toLowerCase() === post.screenName.toLowerCase())
  const mentioned = [...storeNames.entries()]
    .filter(([, names]) => names.some((name) => text.includes(normalizeText(name))))
    .map(([id]) => id)
  return [...new Set([...own.map((account) => account.storeId), ...mentioned])]
}

/**
 * 本文に出てくる日付。M/D・M月D日 を投稿日から近い年で解釈する。
 */
export const dateCandidates = (post: DetectPost): string[] => {
  const text = normalizeText(post.quoted?.text ? `${post.text}\n${post.quoted.text}` : post.text)
  const posted = Date.parse(post.createdAt)
  const year = new Date(posted + 9 * 3_600_000).getUTCFullYear()
  // 前後が数字でなければよい。NFKC で「／」も「/」になるので、前の「/」は除外しない
  const found = [...text.matchAll(/(?<!\d)(\d{1,2})(?:\/|月)(\d{1,2})(?!\d)/g)].flatMap((match) => {
    const month = Number(match[1])
    const day = Number(match[2])
    if (month < 1 || month > 12 || day < 1 || day > 31) return []
    // 投稿日から半年以上前になる場合は翌年、半年以上先なら前年とみなす
    const candidates = [year - 1, year, year + 1].map((y) => ({ y, t: Date.UTC(y, month - 1, day) - 9 * 3_600_000 }))
    const nearest = candidates.sort((a, b) => Math.abs(a.t - posted) - Math.abs(b.t - posted))[0]
    return [`${nearest.y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`]
  })
  const relative = [
    ...(/本日|今日/.test(text) ? [jstDate(post.createdAt)] : []),
    ...(/明日/.test(text) ? [jstDate(new Date(posted + 86_400_000).toISOString())] : [])
  ]
  return [...new Set([...found, ...relative])].sort()
}

/**
 * 本文に出てくる数量（N 個・枚・名・人・セット）。
 */
export const quantityCandidates = (post: DetectPost): number[] => {
  const text = normalizeText(post.text).replace(/,/g, '')
  return [
    ...new Set(
      [...text.matchAll(/(\d{1,6})(?:個|枚|名|人|セット|点|本)/g)].map((match) => Number(match[1])).filter((n) => n > 0)
    )
  ].sort((a, b) => a - b)
}

const labelOf = (labels: Map<string, string>, store: string) => {
  const label = labels.get(store)
  return label ? label : store
}

const dateKey = (date: string) => `d${date.replace(/-/g, '')}`
const quantityKey = (quantity: number) => `q${quantity}`

export const keyToDate = (key: string) =>
  /^d\d{8}$/.test(key) ? `${key.slice(1, 5)}-${key.slice(5, 7)}-${key.slice(7, 9)}` : undefined
export const keyToQuantity = (key: string) => (/^q\d+$/.test(key) ? Number(key.slice(1)) : undefined)

/**
 * 本文に候補がある項目だけ、候補から選ばせる質問を足す。候補が無ければ質問しない（＝本文に無い）。
 */
export const valueQuestions = (post: DetectPost, stores: string[], storeLabels: Map<string, string>) => {
  const dates = dateCandidates(post)
  const quantities = quantityCandidates(post)
  const questions: Record<string, ClefQuestion> = {}
  if (stores.length >= 1) {
    questions.store = {
      type: 'choice',
      instructions: 'この配布イベントを開催する店舗はどれですか？',
      criteria: {
        ...Object.fromEntries(stores.map((store) => [store, labelOf(storeLabels, store)])),
        none: 'どの店舗でもない・わからない'
      }
    }
  }
  if (dates.length >= 1) {
    const criteria = {
      ...Object.fromEntries(dates.map((date) => [dateKey(date), `${date}（${jstWeekday(`${date}T03:00:00Z`)}）`])),
      none: '本文に書かれていない'
    }
    questions.start_date = { type: 'choice', instructions: '配布の開始日はどれですか？', criteria }
    questions.end_date = { type: 'choice', instructions: '配布の終了日（終了予定日）はどれですか？', criteria }
  }
  if (quantities.length >= 1) {
    questions.quantity = {
      type: 'choice',
      instructions: '配布数（先着・限定の個数）はどれですか？',
      criteria: {
        ...Object.fromEntries(quantities.map((quantity) => [quantityKey(quantity), `${quantity}`])),
        none: '本文に書かれていない'
      }
    }
  }
  return { questions, dates, quantities }
}

/**
 * 終了報告がどのイベントのものか選ばせる質問。候補は同じ店舗で開始済み・期間内のイベント。
 */
export const endedEventQuestion = (
  post: DetectPost,
  stores: readonly string[],
  events: readonly GoldEvent[]
): { question?: ClefQuestion; candidates: GoldEvent[] } => {
  const time = Date.parse(post.createdAt)
  const candidates = events
    .filter((event) => event.stores.some((store) => stores.includes(store)))
    .filter((event) => Date.parse(event.startDate) - 86_400_000 <= time && time <= eventWindow(event).until)
    .slice(0, 60)
  if (candidates.length === 0) return { candidates }
  const criteria = {
    ...Object.fromEntries(
      candidates.map((event, index) => [
        `e${index}`,
        `${event.title}（${event.category}、${jstDate(event.startDate)}〜${event.endDate ? jstDate(event.endDate) : '終了日未定'}）`
      ])
    ),
    none: 'どれでもない'
  }
  return {
    question: { type: 'choice', instructions: 'この投稿が配布終了を伝えているイベントはどれですか？', criteria },
    candidates
  }
}

export const cacheKey = (model: ClefModel, request: Omit<ClefRequest, 'model'>) =>
  createHash('sha256')
    .update(JSON.stringify({ model, version: QUESTION_VERSION, request }))
    .digest('hex')
    .slice(0, 32)

/**
 * dev サーバー（または本番）の admin API 経由で Clef を呼ぶ。
 */
export const callClef = async (endpoint: string, request: ClefRequest, retries = 3): Promise<ClefResponse> => {
  const retry = async (reason: string) => {
    if (retries <= 0) throw new Error(reason)
    await new Promise((resolve) => setTimeout(resolve, 2_000 * (4 - retries)))
    return callClef(endpoint, request, retries - 1)
  }
  // vite の dev サーバーは使い回した接続を切ることがあるので、リクエストごとに閉じる
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Connection: 'close' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(120_000)
  }).catch((error: unknown) => error)
  if (!(response instanceof Response)) return retry(`Clef request failed: ${String(response)}`)
  const body = await response.text()
  if (!response.ok) {
    if (response.status >= 500 || response.status === 429)
      return retry(`Clef ${response.status}: ${body.slice(0, 300)}`)
    throw new Error(`Clef ${response.status}: ${body.slice(0, 300)}`)
  }
  const parsed = ClefResponseSchema.safeParse(JSON.parse(body))
  if (!parsed.success) throw new Error(`unexpected Clef response: ${parsed.error.message}`)
  return parsed.data
}
