import { atom } from 'jotai'

/**
 * イベント一覧ページの店舗フィルタ
 * 特定の店舗キーで絞り込む（nullは全店舗表示）
 */
export const eventListStoreFilterAtom = atom<string | null>(null)
