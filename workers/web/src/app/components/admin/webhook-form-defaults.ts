import { getJstDateKey } from '@biccame/shared/domain/jst-date'
import type { EventRequest, EventRequestQuery } from '@biccame/shared/schemas/event.dto'
import { StoreKeySchema } from '@biccame/shared/schemas/store.dto'
import type { WebhookJob } from '@biccame/shared/schemas/webhook.dto'
import { webhookActionAvailability } from '@/components/admin/webhook-labels'

type PrefillSearch = Omit<EventRequestQuery, 'referenceUrls'>

// 店舗が空のときはキーごと省略するため、空配列は空オブジェクトにする。
const storesSearch = (stores: readonly string[]): Pick<PrefillSearch, 'stores'> =>
  stores.length > 0 ? { stores: stores.join(',') } : {}

// AIの登録候補。日付は JST の日付（YYYY-MM-DD）にそろえる。
const candidateSearch = (candidate: EventRequest): PrefillSearch => ({
  title: candidate.title,
  category: candidate.category,
  ...storesSearch(candidate.stores),
  ...(candidate.characterIds.length > 0 ? { characterIds: candidate.characterIds.join(',') } : {}),
  startDate: getJstDateKey(candidate.startDate),
  ...(candidate.endDate !== undefined ? { endDate: getJstDateKey(candidate.endDate) } : {})
})

// AIの下書き。確定できなかった項目は含めず、作成ページで手入力してもらう。
// 配布条件と数量は作成ページのクエリで渡せないため、ここでは扱わない。
const draftSearch = (draft: NonNullable<WebhookJob['draft']>): PrefillSearch => ({
  ...(draft.title !== undefined ? { title: draft.title } : {}),
  ...(draft.category !== undefined ? { category: draft.category } : {}),
  ...(draft.characterIds.length > 0 ? { characterIds: draft.characterIds.join(',') } : {}),
  ...storesSearch(
    draft.stores.flatMap((store) => {
      const parsed = StoreKeySchema.safeParse(store)
      return parsed.success ? [parsed.data] : []
    })
  ),
  ...(draft.startDate !== undefined ? { startDate: draft.startDate } : {}),
  ...(draft.endDate !== undefined ? { endDate: draft.endDate } : {})
})

type CreateSearchOptions = {
  /** 作成したイベントを紐付ける受信ジョブ。複数候補の投稿では選択中の候補の UUID も渡す。解決できる状態（保留）のときだけ検索条件に含める */
  link?: { postId: string; candidateId?: string }
  /** 選択中の候補の抽出名。登録候補が無いとき、下書きの定型題の代わりにイベント名の初期値にする */
  item?: string
}

// 受信ジョブへの紐付け先。保留以外は resolve API が 409 にするため含めない。
const linkSearch = (
  job: WebhookJob,
  link: CreateSearchOptions['link']
): Pick<EventRequestQuery, 'webhookPostId' | 'webhookCandidateId'> =>
  link === undefined || !webhookActionAvailability(job.status, job.notificationStatus, job.reasons).canResolve
    ? {}
    : {
        webhookPostId: link.postId,
        ...(link.candidateId !== undefined ? { webhookCandidateId: link.candidateId } : {})
      }

/**
 * 受信詳細から開くイベント作成ページ（/admin/events/new）のクエリ。
 * AIの登録候補があればそれを優先し（題は AI が付けたもの）、無ければ下書きから、どちらも無ければ元投稿URLだけを渡す。
 * 登録候補が無いときは、下書きの定型題（店舗名と「配布」入り）ではなく、渡された抽出名を題の初期値にする。
 * 値が無い項目はキーごと省略する。
 */
export const webhookEventCreateSearch = (job: WebhookJob, options: CreateSearchOptions = {}): EventRequestQuery => ({
  ...(job.candidate
    ? candidateSearch(job.candidate)
    : {
        ...(job.draft === null ? {} : draftSearch(job.draft)),
        ...(options.item !== undefined ? { title: options.item } : {})
      }),
  referenceUrls: job.sourceUrl,
  ...linkSearch(job, options.link)
})
