import { createHash } from 'node:crypto'
import dayjs from 'dayjs'
import type { ClefModel, ClefQuestion, ClefRequest, ClefResponse } from '@biccame/shared/event-detect/clef'
import { ClefResponseSchema } from '@biccame/shared/event-detect/clef'
import { jstDate, QUESTION_VERSION } from '@biccame/shared/event-detect/decide'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import { eventWindow } from './analysis'
import type { GoldEvent } from './gold'

export {
  baseQuestions,
  buildState,
  CATEGORY_CRITERIA,
  dateCandidates,
  keyToDate,
  keyToQuantity,
  quantityCandidates,
  QUESTION_VERSION,
  STATUS_CRITERIA,
  storeCandidates,
  valueQuestions
} from '@biccame/shared/event-detect/decide'

/**
 * 終了報告がどのイベントのものか選ばせる質問。候補は同じ店舗で開始済み・期間内のイベント。
 */
export const endedEventQuestion = (
  post: DetectPost,
  stores: readonly string[],
  events: readonly GoldEvent[]
): { question?: ClefQuestion; candidates: GoldEvent[] } => {
  const time = dayjs(post.createdAt).valueOf()
  const candidates = events
    .filter((event) => event.stores.some((store) => stores.includes(store)))
    .filter((event) => dayjs(event.startDate).valueOf() - 86_400_000 <= time && time <= eventWindow(event).until)
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
