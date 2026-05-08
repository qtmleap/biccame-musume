import { atom } from 'jotai'

/**
 * 管理画面のイベント一覧の店舗フィルタ
 * 公開側 /events のフィルタとは独立
 */
export const eventListAdminStoreFilterAtom = atom<string | null>(null)
