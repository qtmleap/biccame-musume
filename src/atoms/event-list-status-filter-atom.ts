import { atom } from 'jotai'

/**
 * URLを持たないイベント一覧用のステータスフィルタ
 * 開催前・開催中・終了済のいずれを表示するか
 * イベントルートはURL条件を使い、旧localStorageを読み込まない。
 */
export const eventListStatusFilterAtom = atom<{
  upcoming: boolean
  ongoing: boolean
  ended: boolean
}>({
  upcoming: true,
  ongoing: true,
  ended: false
})
