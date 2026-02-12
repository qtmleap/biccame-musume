import { atomWithStorage } from 'jotai/utils'

/**
 * イベント一覧ページのユーザーアクティビティフィルタ
 * 興味のあるイベント・達成済みイベントを非表示にする
 */
export const eventUserActivityFilterAtom = atomWithStorage<{
  hideInterested: boolean
  hideCompleted: boolean
}>('event-user-activity-filter', {
  hideInterested: false,
  hideCompleted: false
})
