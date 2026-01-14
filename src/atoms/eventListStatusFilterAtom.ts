import { atomWithStorage } from 'jotai/utils'

/**
 * イベント一覧ページのステータスフィルタ
 * 開催前・開催中・終了済のいずれを表示するか
 */
export const eventListStatusFilterAtom = atomWithStorage<{
  upcoming: boolean
  ongoing: boolean
  ended: boolean
}>('event-list-status-filter', {
  upcoming: true,
  ongoing: true,
  ended: false
})
