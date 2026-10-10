import type { EMULATED_SORTS } from '@biccame/shared/event-detect/viewer'
import type { EventDetectEmulatedSearch, EventDetectSortOrder } from '@/schemas/event-detect-search'

// LLM イベント一覧の並べ替え。表示から切り離した純粋関数だけを置く（統計画面のアカウント別と同じ作り）。

export type EmulatedSortKey = (typeof EMULATED_SORTS)[number]

export type EmulatedSort = { key: EmulatedSortKey; order: EventDetectSortOrder }

/** 既定の列は最初の言及 */
export const DEFAULT_EMULATED_SORT_KEY: EmulatedSortKey = 'firstSeen'

/** 別の列を押したときの最初の向き。店舗は昇順、ほかは降順（新しい順・多い順） */
export const firstEmulatedSortOrder = (key: EmulatedSortKey): EventDetectSortOrder => (key === 'store' ? 'asc' : 'desc')

/** URL の検索パラメータから並べ替えの状態を決める。省略された項目は既定（最初の言及、その列の最初の向き）で補う */
export const resolveEmulatedSort = ({
  sort,
  order
}: Pick<EventDetectEmulatedSearch, 'sort' | 'order'>): EmulatedSort => {
  const key = sort === undefined ? DEFAULT_EMULATED_SORT_KEY : sort
  return { key, order: order === undefined ? firstEmulatedSortOrder(key) : order }
}

/** 並べ替えの状態を URL の検索パラメータにする。既定と同じ項目は undefined にして URL から外す */
export const emulatedSortToSearch = ({
  key,
  order
}: EmulatedSort): Pick<EventDetectEmulatedSearch, 'sort' | 'order'> => ({
  sort: key === DEFAULT_EMULATED_SORT_KEY ? undefined : key,
  order: order === firstEmulatedSortOrder(key) ? undefined : order
})

/** 見出しを押した後の状態。選択中の列なら向きを入れ替え、別の列ならその列の最初の向きにする */
export const nextEmulatedSort = (current: EmulatedSort, pressed: EmulatedSortKey): EmulatedSort =>
  pressed === current.key
    ? { key: pressed, order: current.order === 'asc' ? 'desc' : 'asc' }
    : { key: pressed, order: firstEmulatedSortOrder(pressed) }
