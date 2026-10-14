import { getJstDateKey } from '@biccame/shared/domain/jst-date'
import type { EventRequest, EventRequestQuery } from '@biccame/shared/schemas/event.dto'
import { StoreKeySchema } from '@biccame/shared/schemas/store.dto'
import type { WebhookJob } from '@biccame/shared/schemas/webhook.dto'

type PrefillSearch = Omit<EventRequestQuery, 'referenceUrls'>

// 店舗が空のときはキーごと省略するため、空配列は空オブジェクトにする。
const storesSearch = (stores: readonly string[]): Pick<PrefillSearch, 'stores'> =>
  stores.length > 0 ? { stores: stores.join(',') } : {}

// AIの登録候補。日付は JST の日付（YYYY-MM-DD）にそろえる。
const candidateSearch = (candidate: EventRequest): PrefillSearch => ({
  title: candidate.title,
  category: candidate.category,
  ...storesSearch(candidate.stores),
  startDate: getJstDateKey(candidate.startDate),
  ...(candidate.endDate !== undefined ? { endDate: getJstDateKey(candidate.endDate) } : {})
})

// AIの下書き。確定できなかった項目は含めず、作成ページで手入力してもらう。
// 配布条件と数量は作成ページのクエリで渡せないため、ここでは扱わない。
const draftSearch = (draft: NonNullable<WebhookJob['draft']>): PrefillSearch => ({
  ...(draft.title !== undefined ? { title: draft.title } : {}),
  ...(draft.category !== undefined ? { category: draft.category } : {}),
  ...storesSearch(
    draft.stores.flatMap((store) => {
      const parsed = StoreKeySchema.safeParse(store)
      return parsed.success ? [parsed.data] : []
    })
  ),
  ...(draft.startDate !== undefined ? { startDate: draft.startDate } : {}),
  ...(draft.endDate !== undefined ? { endDate: draft.endDate } : {})
})

/**
 * 受信詳細から開くイベント作成ページ（/admin/events/new）のクエリ。
 * AIの登録候補があればそれを優先し、無ければ下書きから、どちらも無ければ元投稿URLだけを渡す。
 * 値が無い項目はキーごと省略する。
 */
export const webhookEventCreateSearch = (job: WebhookJob): EventRequestQuery => ({
  ...(job.candidate ? candidateSearch(job.candidate) : job.draft === null ? {} : draftSearch(job.draft)),
  referenceUrls: job.sourceUrl
})
