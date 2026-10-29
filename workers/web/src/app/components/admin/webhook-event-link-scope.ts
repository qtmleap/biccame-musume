import { postAccountStore } from '@biccame/shared/event-detect/detection'
import type { Event } from '@biccame/shared/schemas/event.dto'
import { StoreKeySchema } from '@biccame/shared/schemas/store.dto'
import type { WebhookCandidate, WebhookJob } from '@biccame/shared/schemas/webhook.dto'
import dayjs from 'dayjs'
import { STORE_NAME_LABELS } from '@/locales/app.content'

/** 連携ダイアログが一覧に出すイベントの範囲。 */
export type WebhookLinkScope = {
  /** 連携先を探す店舗。空のときは店舗が決まらない（店舗では絞らない）。 */
  stores: readonly string[]
  /** 投稿日時（ISO 8601）。「終わっていない」の基準は今ではなく、この投稿の時点。 */
  postedAt: string
}

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
// 日本時間は UTC+9 で夏時間が無いので、プラグインに頼らず固定のずれで日の始まりを求める。
const JST_OFFSET_MS = 9 * HOUR_MS

/** 日本時間でその日の 0 時（エポックミリ秒）。 */
const jstDayStart = (timestamp: number): number =>
  Math.floor((timestamp + JST_OFFSET_MS) / DAY_MS) * DAY_MS - JST_OFFSET_MS

/**
 * 連携先を探す店舗。対象は選択中の候補(無ければ受信ジョブ全体)で、次の順で最初に決まったものを返す。
 *  1. 判定で採用した登録候補の店舗
 *  2. 候補の抽出段階の店舗(storeKey。候補にだけある)
 *  3. 保留の下書きの店舗
 *  4. 投稿アカウントの店舗(複数店舗のアカウント・店舗以外のアカウントは決まらない)
 * どれも無ければ空配列(店舗が決まらない)。
 */
export const webhookLinkStores = (job: WebhookJob, active: WebhookCandidate | undefined): string[] => {
  const source = active === undefined ? job : active
  const adopted = source.candidate === null ? [] : source.candidate.stores
  if (adopted.length > 0) return [...adopted]
  const storeKey = active === undefined ? null : active.storeKey
  if (storeKey !== null) return [storeKey]
  const drafted = source.draft === null ? [] : source.draft.stores
  if (drafted.length > 0) return [...drafted]
  const account = postAccountStore(job.post.screenName)
  return account === null ? [] : [account]
}

/**
 * 連携先の選択肢にするイベント。投稿の時点で終わっていなくて、対象の店舗で開かれているものだけ。
 * 終わっていない = 実際の終了日時が無いか投稿日時以降で、終了予定日が無いか投稿日の日本時間の 0 時以降（D1 側の unfinishedStoreEvents と同じ考え方で、基準を今ではなく投稿日時にしてある）。
 * 開始前のイベントは除かない(告知の投稿を、登録済みの開始前のイベントへ連携することがある)。
 * 店舗が決まるときは、そのどれかを含むイベント(複数店舗のイベントも対象)。決まらないときは店舗で絞らない。
 */
export const linkableWebhookEvents = (events: readonly Event[], scope: WebhookLinkScope): Event[] => {
  const postedAt = dayjs(scope.postedAt).valueOf()
  const dayStart = jstDayStart(postedAt)
  return events.filter(
    (event) =>
      (event.endedAt === undefined || event.endedAt.valueOf() >= postedAt) &&
      (event.endDate === undefined || event.endDate.valueOf() >= dayStart) &&
      (scope.stores.length === 0 || event.stores.some((store) => scope.stores.includes(store)))
  )
}

const storeLabel = (key: string): string => {
  const parsed = StoreKeySchema.safeParse(key)
  return parsed.success ? STORE_NAME_LABELS[parsed.data] : key
}

/** ダイアログの説明の先頭の一文。一覧に出す範囲(店舗が決まるか、決まらず全店舗か)を伝える。 */
export const webhookLinkScopeDescription = (stores: readonly string[]): string =>
  stores.length === 0
    ? '店舗が決まらないため、全店舗の、投稿の時点で終わっていないイベントを表示しています。'
    : `${stores.map(storeLabel).join('、')}で、投稿の時点で終わっていないイベントから選んでください。`
