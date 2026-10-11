import type { z } from 'zod'
import { DEFAULT_EVENT_LIST_FILTERS, type EventListFilters, type EventSearchSchema } from '@/schemas/event-search'

/** 絞り込みを表す URL のパラメータ。page や計測用のパラメータは含めない。 */
export const EVENT_LIST_FILTER_PARAMS = [
  'category',
  'status',
  'region',
  'store',
  'hideInterested',
  'hideCompleted',
  'hideOldEvents'
] as const

export type EventListFilterSearch = Partial<
  Pick<z.infer<typeof EventSearchSchema>, (typeof EVENT_LIST_FILTER_PARAMS)[number]>
>

/**
 * URL に絞り込みのパラメータが 1 つでもあるか
 * 不正な値が書かれていても「あり」として数える(スキーマが既定値へ戻して返すため undefined にならない)
 */
export const hasEventListFilterParams = (search: EventListFilterSearch) =>
  EVENT_LIST_FILTER_PARAMS.some((key) => search[key] !== undefined)

const pick = <T>(value: T | undefined, fallback: T) => (value === undefined ? fallback : value)

/**
 * URL の search 値と保存値から、実際に使う絞り込みを決める(全か無か)
 * - URL に絞り込みのパラメータが 1 つも無い: 保存値をまるごと使う
 * - 1 つでもある: 保存値は一切使わず、URL の値だけを使う。URL に無い項目は既定値にする
 * 未ログインでは非表示設定の画面が無いので、保存値の非表示設定は効かせない(URL の明示は効く)。
 */
export const resolveEventListFilters = (
  search: EventListFilterSearch,
  stored: EventListFilters,
  authenticated: boolean
): EventListFilters => {
  if (!hasEventListFilterParams(search)) {
    return authenticated ? stored : { ...stored, hideInterested: false, hideCompleted: false }
  }
  return {
    category: pick(search.category, DEFAULT_EVENT_LIST_FILTERS.category),
    status: pick(search.status, DEFAULT_EVENT_LIST_FILTERS.status),
    region: pick(search.region, DEFAULT_EVENT_LIST_FILTERS.region),
    // 空文字は「店舗の指定なし」(不正な店舗もここへ寄せられている)。
    store: search.store === undefined || search.store === '' ? undefined : search.store,
    hideInterested: pick(search.hideInterested, DEFAULT_EVENT_LIST_FILTERS.hideInterested),
    hideCompleted: pick(search.hideCompleted, DEFAULT_EVENT_LIST_FILTERS.hideCompleted),
    hideOldEvents: pick(search.hideOldEvents, DEFAULT_EVENT_LIST_FILTERS.hideOldEvents)
  }
}

/**
 * 絞り込みを URL に書く search 値へ変換する
 * 未ログインの間は非表示設定を書かない(書くと、ログイン後も「パラメータあり」として保存値が無視されるため)。
 * store は undefined のまま返し、遷移時に URL から消えるようにする。
 */
export const toEventListFilterSearch = (filters: EventListFilters, authenticated: boolean) => ({
  category: filters.category,
  status: filters.status,
  region: filters.region,
  store: filters.store,
  hideOldEvents: filters.hideOldEvents,
  ...(authenticated ? { hideInterested: filters.hideInterested, hideCompleted: filters.hideCompleted } : {})
})

/**
 * 変更後の絞り込みから、保存する値を決める
 * 未ログインの間は非表示設定を触れないので、保存済みの値を残す。
 */
export const toStoredEventListFilters = (
  next: EventListFilters,
  stored: EventListFilters,
  authenticated: boolean
): EventListFilters =>
  authenticated ? next : { ...next, hideInterested: stored.hideInterested, hideCompleted: stored.hideCompleted }

/**
 * URL を保存値で補って正規化してよいか
 * URL に絞り込みが無いときだけ行う。ただし未ログインで、保存値に非表示設定があるときは待つ
 * (非表示設定を書かずに正規化すると、ログイン後に保存値の非表示設定が無視されるため)。
 */
export const shouldNormalizeEventListSearch = (
  search: EventListFilterSearch,
  stored: EventListFilters,
  authenticated: boolean
) => !hasEventListFilterParams(search) && (authenticated || !(stored.hideInterested || stored.hideCompleted))
