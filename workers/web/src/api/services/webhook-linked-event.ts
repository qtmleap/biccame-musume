import { detectionThresholds, sendRequest, type WebhookDetectionRun } from '@api/services/webhook-detection-run'
import type { Bindings } from '@api/types/bindings'
import { toD1DateTime } from '@biccame/shared/domain/d1-datetime'
import type { ClefRequest } from '@biccame/shared/event-detect/clef'
import {
  createLinkedEventRequest,
  type LinkableEvent,
  linkedEventOptions,
  linkedEventProposalOf,
  linkedEventTargetStore,
  postAccountStore
} from '@biccame/shared/event-detect/detection'
import type { WebhookLinkedEvent } from '@biccame/shared/schemas/webhook.dto'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { z } from 'zod'

dayjs.extend(utc)
dayjs.extend(timezone)

/** 選択肢にするイベントの取得上限。linkedEventOptions の上限と同じ。 */
const FETCH_LIMIT = 50

const RowSchema = z.object({
  id: z.string().nonempty(),
  title: z.string().nonempty(),
  category: z.string().nonempty(),
  startDate: z.string().nonempty(),
  endDate: z.string().nonempty().nullable()
})

/**
 * 店舗のまだ終了していないイベント（新しい開始日順、最大 50 件）。読み取りだけで、events は書き換えない。
 * 終了していない = 実際の終了日時（ended_at）が無く、かつ終了予定日（end_date）が無いか、日本時間の今日以降。複数店舗のイベントは、その店舗を含むなら対象にする。
 * 日付は D1 の保存形式（toD1DateTime）の文字列として比較する。
 */
export const unfinishedStoreEvents = async (
  env: Pick<Bindings, 'DB'>,
  storeKey: string,
  now: dayjs.Dayjs = dayjs()
): Promise<LinkableEvent[]> => {
  const today = toD1DateTime(now.tz('Asia/Tokyo').startOf('day'))
  const rows = await env.DB.prepare(
    `SELECT e.id AS id,e.title AS title,e.category AS category,e.start_date AS startDate,e.end_date AS endDate
      FROM events e
      WHERE e.ended_at IS NULL AND (e.end_date IS NULL OR e.end_date>=?)
        AND EXISTS (SELECT 1 FROM event_stores s WHERE s.event_id=e.id AND s.store_key=?)
      ORDER BY e.start_date DESC,e.id LIMIT ${FETCH_LIMIT}`
  )
    .bind(today, storeKey)
    .all()
  return rows.results.flatMap((row) => {
    const parsed = RowSchema.safeParse(row)
    return parsed.success ? [parsed.data] : []
  })
}

const warn = (error: unknown) =>
  console.warn('[webhook-linked-event]', JSON.stringify({ error: error instanceof Error ? error.message : 'unknown' }))

/**
 * 3段目（連携先の提案）。「終了」または「継続」と判定された候補の店舗が 1 つに決まり、その店舗にまだ終了していないイベントがあるときだけ、Clef に 1 回聞く。
 * 選ばれたイベントの確率が下限以上のときだけ提案を返し、該当なし・下限未満・確率の欠落は null。
 * 自動では連携せず、events も書き換えない。提案は判定結果（result_json の discovery）へ保存するために呼び出し側へ返すだけ。
 * イベントの取得・AI の送信・応答の不正は判定全体を失敗にせず、警告を残して提案なし（null）にする。
 * beforeSend（送信入力の保存）の失敗は 1 段目・2 段目と同じく例外のまま伝える（リースを失った判定を続けない）。
 * beforeSend は送る直前に、1段目・2段目の送信入力に 3 段目を足したものを渡して呼ばれる。
 */
export const proposeWebhookLinkedEvent = async (
  env: Bindings,
  run: WebhookDetectionRun,
  options: {
    storeKey: string | null
    /** 投稿者のアカウント名(screenName)。判定で店舗が決まらないときの、投稿アカウントの店舗の解決に使う。 */
    screenName: string
    /** 配布物の名前。旧単一ジョブの仮の名前など、渡さないときは null。 */
    item: string | null
    beforeSend: (sent: ClefRequest[]) => Promise<void>
  }
): Promise<WebhookLinkedEvent | null> => {
  const prepared = await (async () => {
    try {
      const store = linkedEventTargetStore(
        run.request,
        run.response,
        detectionThresholds(run.configuration),
        options.storeKey,
        postAccountStore(options.screenName)
      )
      if (store === null) return null
      const events = linkedEventOptions(await unfinishedStoreEvents(env, store))
      if (events.length === 0) return null
      const request = createLinkedEventRequest(run.requests[0], {
        store,
        events,
        ...(options.item === null ? {} : { item: options.item })
      })
      return { events, request }
    } catch (error) {
      warn(error)
      return null
    }
  })()
  if (prepared === null) return null
  await options.beforeSend([...run.requests, prepared.request])
  try {
    const response = await sendRequest(env, run.configuration.model, prepared.request)
    return linkedEventProposalOf(prepared.request, response, prepared.events)
  } catch (error) {
    warn(error)
    return null
  }
}
