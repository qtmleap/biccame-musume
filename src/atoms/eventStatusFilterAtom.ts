import { atomWithStorage } from 'jotai/utils'

/**
 * イベント管理画面のステータスフィルタ
 * 開催前・開催中・終了済のいずれを表示するか
 */
export const eventStatusFilterAtom = atomWithStorage<{
  upcoming: boolean
  ongoing: boolean
  ended: boolean
}>('event-status-filter', {
  upcoming: true,
  ongoing: true,
  ended: true
})
