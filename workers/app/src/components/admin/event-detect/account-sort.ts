import type { Summary } from '@biccame/shared/event-detect/viewer'
import type {
  EventDetectAccountSortKey,
  EventDetectSortOrder,
  EventDetectStatsSearch
} from '@/schemas/event-detect-search'
import { storeName } from './constants'

// 統計画面「アカウント別」の並べ替え。表示から切り離した純粋関数だけを置く。

/** 並べ替えの対象になる行。store が null の行（その他）は表に載せない */
export type SortableAccount = Pick<
  Summary['accounts'][number],
  'screenName' | 'posts' | 'candidates' | 'emulated' | 'emulatedEnded' | 'events' | 'goldPosts'
> & { store: string }

export type AccountSort = { key: EventDetectAccountSortKey; order: EventDetectSortOrder }

/** 既定の列は投稿数 */
export const DEFAULT_ACCOUNT_SORT_KEY: EventDetectAccountSortKey = 'posts'

/** 別の列を押したときの最初の向き。文字の列は昇順、数値の列は降順 */
export const firstSortOrder = (key: EventDetectAccountSortKey): EventDetectSortOrder =>
  key === 'screenName' || key === 'store' ? 'asc' : 'desc'

/** URL の検索パラメータから並べ替えの状態を決める。省略された項目は既定（投稿数、その列の最初の向き）で補う */
export const resolveAccountSort = ({ sort, order }: EventDetectStatsSearch): AccountSort => {
  const key = sort === undefined ? DEFAULT_ACCOUNT_SORT_KEY : sort
  return { key, order: order === undefined ? firstSortOrder(key) : order }
}

/** 並べ替えの状態を URL の検索パラメータにする。既定と同じ項目は undefined にして URL から外す */
export const accountSortToSearch = ({ key, order }: AccountSort): EventDetectStatsSearch => ({
  sort: key === DEFAULT_ACCOUNT_SORT_KEY ? undefined : key,
  order: order === firstSortOrder(key) ? undefined : order
})

/** 見出しを押した後の状態。選択中の列なら向きを入れ替え、別の列ならその列の最初の向きにする */
export const nextAccountSort = (current: AccountSort, pressed: EventDetectAccountSortKey): AccountSort =>
  pressed === current.key
    ? { key: pressed, order: current.order === 'asc' ? 'desc' : 'asc' }
    : { key: pressed, order: firstSortOrder(pressed) }

/** 文字列を順序だけで比べる（ロケールに依らない。小文字のアカウント名用） */
const compareText = (a: string, b: string): number => {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

/** 昇順での比較。同値は 0 */
const compareAscending = (key: EventDetectAccountSortKey, a: SortableAccount, b: SortableAccount): number => {
  switch (key) {
    case 'screenName':
      return compareText(a.screenName.toLowerCase(), b.screenName.toLowerCase())
    case 'store':
      return storeName(a.store).localeCompare(storeName(b.store), 'ja')
    case 'posts':
      return a.posts - b.posts
    case 'candidates':
      return a.candidates - b.candidates
    case 'emulated':
      return a.emulated - b.emulated
    case 'emulatedEnded':
      return a.emulatedEnded - b.emulatedEnded
    case 'events':
      return a.events - b.events
    case 'goldPosts':
      return a.goldPosts - b.goldPosts
  }
}

/**
 * 指定の列と向きで並べ替えた新しい配列を返す。
 * 値が同じ行は向きに関わらず screenName の昇順（大文字小文字は無視）にして、並びを安定させる。
 */
export const sortAccounts = <T extends SortableAccount>(accounts: readonly T[], { key, order }: AccountSort): T[] => {
  const sign = order === 'asc' ? 1 : -1
  return [...accounts].sort((a, b) => {
    const primary = compareAscending(key, a, b) * sign
    if (primary !== 0) return primary
    const byName = compareText(a.screenName.toLowerCase(), b.screenName.toLowerCase())
    return byName !== 0 ? byName : compareText(a.screenName, b.screenName)
  })
}
