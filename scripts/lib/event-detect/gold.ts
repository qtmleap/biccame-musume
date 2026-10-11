import { setTimeout } from 'node:timers/promises'
import { z } from 'zod'

// D1 に登録済みのイベントを「正解データ」として扱う。参考 URL が X の投稿を指していれば、
// その投稿は種別（告知・開始・終了）付きの正例になる。参考 URL は 1 イベントにつき 1〜3 件しか
// 無いので、正例に無いことは「イベントではない」ことを意味しない。

export const ReferenceTypeSchema = z.enum(['announce', 'start', 'end'])

export type ReferenceType = z.infer<typeof ReferenceTypeSchema>

export const GoldEventSchema = z.object({
  uuid: z.uuid(),
  title: z.string().nonempty(),
  category: z.string().nonempty(),
  stores: z.array(z.string().nonempty()),
  startDate: z.iso.datetime(),
  endDate: z.iso.datetime().optional(),
  endedAt: z.iso.datetime().optional(),
  /** 配布数。条件側の quantity（先着・抽選の人数）とは別に登録されることがある */
  limitedQuantity: z.number().int().positive().optional(),
  conditions: z.array(
    z.object({
      type: z.enum(['purchase', 'first_come', 'lottery', 'everyone']),
      purchaseAmount: z.number().nonnegative().optional(),
      quantity: z.number().int().positive().optional()
    })
  ),
  /** 対象のビッカメ娘。未指定なら開催店舗と同じ */
  characterId: z.string().nonempty().optional(),
  isPreliminary: z.boolean(),
  groupId: z.string().nonempty().optional(),
  referenceUrls: z.array(z.object({ type: ReferenceTypeSchema, url: z.url() }))
})

export type GoldEvent = z.infer<typeof GoldEventSchema>

const EventListSchema = z.array(z.object({ uuid: z.uuid() }))

/**
 * X の投稿 URL から screen_name と投稿 ID を取り出す。投稿以外の URL は undefined。
 */
export const parseStatusUrl = (url: string): { screenName: string; id: string } | undefined => {
  const match = /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([^/?#]+)\/status(?:es)?\/(\d+)/.exec(url)
  return match ? { screenName: match[1], id: match[2] } : undefined
}

// X の投稿 ID（Snowflake）の上位ビットは 2010-11-04 起点のミリ秒。
const TWITTER_EPOCH = 1288834974657n

export const snowflakeTime = (id: string): number => Number((BigInt(id) >> 22n) + TWITTER_EPOCH)

export type GoldRef = { eventId: string; type: ReferenceType; screenName: string }

/**
 * 投稿 ID → 参照しているイベントの対応表。1 つの投稿が複数店舗のイベントに使われることがある。
 */
export const buildGoldIndex = (events: readonly GoldEvent[]): Map<string, GoldRef[]> => {
  const index = new Map<string, GoldRef[]>()
  for (const event of events) {
    for (const reference of event.referenceUrls) {
      const status = parseStatusUrl(reference.url)
      if (!status) continue
      const refs = index.get(status.id)
      const ref = { eventId: event.uuid, type: reference.type, screenName: status.screenName }
      if (refs) refs.push(ref)
      else index.set(status.id, [ref])
    }
  }
  return index
}

type FetchOptions = {
  baseUrl: string
  retries?: number
  retryDelayMs?: number
  fetchImpl?: typeof fetch
  onProgress?: (done: number, total: number) => void
}

/**
 * 公開 API から検証済みイベントを詳細付きで取得する。
 *
 * 一覧には参考 URL が含まれないため 1 件ずつ詳細を取る。並列で叩くと Worker が
 * 1101（例外）を返すことがあったので、直列で取得し、JSON 以外の応答は再試行する。
 */
export const fetchGoldEvents = async (options: FetchOptions): Promise<GoldEvent[]> => {
  const fetchImpl = options.fetchImpl ? options.fetchImpl : fetch
  const retries = options.retries === undefined ? 3 : options.retries
  const retryDelayMs = options.retryDelayMs === undefined ? 2000 : options.retryDelayMs

  const getJson = async (path: string, attempt = 0): Promise<unknown> => {
    const response = await fetchImpl(new URL(path, options.baseUrl), { signal: AbortSignal.timeout(30_000) })
    const body = await response.text()
    const parsed = response.ok ? parseJson(body) : undefined
    if (parsed !== undefined) return parsed
    if (attempt >= retries) throw new Error(`GET ${path} failed: ${response.status} ${body.slice(0, 80)}`)
    await setTimeout(retryDelayMs * (attempt + 1))
    return getJson(path, attempt + 1)
  }

  const list = EventListSchema.safeParse(await getJson('/api/events'))
  if (!list.success) throw new Error(`Unexpected /api/events response: ${list.error.message}`)

  const events: GoldEvent[] = []
  for (const [index, { uuid }] of list.data.entries()) {
    const detail = GoldEventSchema.safeParse(await getJson(`/api/events/${uuid}`))
    if (!detail.success) throw new Error(`Unexpected /api/events/${uuid} response: ${detail.error.message}`)
    events.push(detail.data)
    options.onProgress?.(index + 1, list.data.length)
  }
  return events
}

const parseJson = (body: string): unknown => {
  try {
    return JSON.parse(body)
  } catch {
    return undefined
  }
}
