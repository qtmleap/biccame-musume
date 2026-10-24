import {
  DEFAULT_WEBHOOK_JOB_ORDER,
  DEFAULT_WEBHOOK_JOB_SORT,
  WebhookDiscoveryFilterSchema,
  WebhookJobOrderSchema,
  WebhookJobRangeSchema,
  WebhookJobSortSchema,
  WebhookKeywordVerdictSchema,
  WebhookPostStatusFilterSchema,
  WebhookScreenNameSchema
} from '@biccame/shared/schemas/webhook.dto'
import { atom } from 'jotai'
import { atomWithStorage, createJSONStorage } from 'jotai/utils'
import { z } from 'zod'
import { INITIAL_WEBHOOK_PAGINATION, webhookPaginationAtom } from '@/atoms/webhook-pagination-atom'

const KEY = 'biccame-admin-webhook-filter'

/**
 * Webhook 受信履歴の絞り込みと並べ替え。値の名前と範囲は API のクエリ（WebhookJobQuerySchema）と同じ。
 * null は「指定なし」（期間は全期間、判定・ステータスはすべて）。
 */
export const WebhookFilterSchema = z.object({
  screenName: WebhookScreenNameSchema.nullable().default(null),
  discovery: WebhookDiscoveryFilterSchema.nullable().default(null),
  range: WebhookJobRangeSchema.nullable(),
  sort: WebhookJobSortSchema,
  order: WebhookJobOrderSchema,
  verdict: WebhookKeywordVerdictSchema.nullable(),
  postStatus: WebhookPostStatusFilterSchema.nullable()
})
export type WebhookFilter = z.infer<typeof WebhookFilterSchema>

/** 条件が何も無い状態（判定・ステータスもすべて）・日時の新しい順。「条件をクリア」で戻す先。 */
export const NO_WEBHOOK_FILTER: WebhookFilter = {
  screenName: null,
  discovery: null,
  range: null,
  sort: DEFAULT_WEBHOOK_JOB_SORT,
  order: DEFAULT_WEBHOOK_JOB_ORDER,
  verdict: null,
  postStatus: null
}

/** 判定は一致・日時の新しい順。保存が無い・壊れているときの値。 */
export const INITIAL_WEBHOOK_FILTER: WebhookFilter = { ...NO_WEBHOOK_FILTER, verdict: 'match' }

/** 保存値を検証する。形が違う値は既定値に倒す。 */
export const parseWebhookFilter = (value: unknown): WebhookFilter => {
  const result = WebhookFilterSchema.safeParse(value)
  return result.success ? result.data : INITIAL_WEBHOOK_FILTER
}

export const sameWebhookFilter = (a: WebhookFilter, b: WebhookFilter): boolean =>
  a.screenName === b.screenName &&
  a.discovery === b.discovery &&
  a.range === b.range &&
  a.sort === b.sort &&
  a.order === b.order &&
  a.verdict === b.verdict &&
  a.postStatus === b.postStatus

/** 外せる条件（絞り込み・並べ替え）が残っているか。「条件をクリア」を無効にする判定に使う。 */
export const hasWebhookFilterConditions = (filter: WebhookFilter): boolean =>
  !sameWebhookFilter(filter, NO_WEBHOOK_FILTER)

/** 変えても何も変わらないときは、同じ参照を返す（呼び出し側が変更の有無を === で見分けられる）。 */
const updated = (filter: WebhookFilter, next: WebhookFilter): WebhookFilter =>
  sameWebhookFilter(filter, next) ? filter : next

export const setWebhookScreenName = (filter: WebhookFilter, screenName: WebhookFilter['screenName']): WebhookFilter =>
  updated(filter, { ...filter, screenName })

export const setWebhookDiscovery = (filter: WebhookFilter, discovery: WebhookFilter['discovery']): WebhookFilter =>
  updated(filter, { ...filter, discovery })

export const setWebhookRange = (filter: WebhookFilter, range: WebhookFilter['range']): WebhookFilter =>
  updated(filter, { ...filter, range })

export const setWebhookVerdict = (filter: WebhookFilter, verdict: WebhookFilter['verdict']): WebhookFilter =>
  updated(filter, { ...filter, verdict })

export const setWebhookPostStatus = (filter: WebhookFilter, postStatus: WebhookFilter['postStatus']): WebhookFilter =>
  updated(filter, { ...filter, postStatus })

/**
 * 精度の並べ替えを 既定（日時の新しい順）→ 精度の高い順 → 精度の低い順 → 既定 と巡回させる。
 * 精度以外の並びから押したときは、精度の高い順から始める。
 */
export const cycleWebhookConfidenceSort = (filter: WebhookFilter): WebhookFilter => {
  if (filter.sort === 'confidence' && filter.order === 'desc') return { ...filter, order: 'asc' }
  if (filter.sort === 'confidence')
    return { ...filter, sort: DEFAULT_WEBHOOK_JOB_SORT, order: DEFAULT_WEBHOOK_JOB_ORDER }
  return { ...filter, sort: 'confidence', order: 'desc' }
}

/** 列見出しの aria-sort。並べ替えの軸がその列でなければ none。 */
export const webhookColumnAriaSort = (
  filter: Pick<WebhookFilter, 'sort' | 'order'>,
  column: WebhookFilter['sort']
): 'none' | 'ascending' | 'descending' => {
  if (filter.sort !== column) return 'none'
  return filter.order === 'asc' ? 'ascending' : 'descending'
}

// sessionStorage に触れない環境（プライベートモード・容量超過・SSR やテスト）でも、一覧の操作を止めない。
const sessionStringStorage = {
  getItem: (key: string) => {
    try {
      return window.sessionStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem: (key: string, value: string) => {
    try {
      window.sessionStorage.setItem(key, value)
    } catch {
      // 保存できなくても、メモリ上の状態でそのタブの操作は続けられる。
    }
  },
  removeItem: (key: string) => {
    try {
      window.sessionStorage.removeItem(key)
    } catch {
      // 保存できなくても、メモリ上の状態でそのタブの操作は続けられる。
    }
  }
}

const raw = createJSONStorage<unknown>(() => sessionStringStorage)

// jotai は SyncStorage 型を公開していないので、createJSONStorage の戻り値から導く。
type FilterStorage = ReturnType<typeof createJSONStorage<WebhookFilter>>
// 読み出しのたびに形を検証する。sessionStorage はタブ単位なので、他タブの書き込みを購読する subscribe は持たない。
const storage: FilterStorage = {
  getItem: (key) => parseWebhookFilter(raw.getItem(key, null)),
  setItem: (key, value) => raw.setItem(key, value),
  removeItem: (key) => raw.removeItem(key)
}

/**
 * Webhook 受信履歴の絞り込みと並べ替え。
 * 詳細から戻る・ブラウザの戻る・再読み込みで条件が消えないよう、ページ位置と同じくタブ単位の sessionStorage に保存する。
 * 初回の描画から保存値を使う（getOnInit）。使わないと既定の条件で一度取りに行ってしまう。
 */
export const webhookFilterAtom = atomWithStorage<WebhookFilter>(KEY, INITIAL_WEBHOOK_FILTER, storage, {
  getOnInit: true
})

/**
 * 絞り込み・並べ替えを更新する書き込み専用 atom。条件が変わったら、必ず同時にページ位置を1ページ目へ戻す。
 * 続き（cursor）は条件ごとに別の並びの位置なので、条件を変えたまま持ち越すと別の条件の続きを取りに行ってしまう。
 * 実際に変わらなかったとき（update が同じ値を返したとき）は、ページ位置も動かさない。
 */
export const changeWebhookFilterAtom = atom(null, (get, set, update: (filter: WebhookFilter) => WebhookFilter) => {
  const current = get(webhookFilterAtom)
  const next = update(current)
  if (sameWebhookFilter(current, next)) return
  set(webhookFilterAtom, next)
  set(webhookPaginationAtom, INITIAL_WEBHOOK_PAGINATION)
})
