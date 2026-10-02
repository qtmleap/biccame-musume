import { atom } from 'jotai'

/**
 * URLを持たないイベント一覧用のユーザーアクティビティフィルタ
 * 興味のあるイベント・達成済みイベントを非表示にする
 * イベントルートはURL条件を使い、旧localStorageを読み込まない。
 */
export const eventUserActivityFilterAtom = atom<{
  hideInterested: boolean
  hideCompleted: boolean
}>({
  hideInterested: false,
  hideCompleted: false
})
