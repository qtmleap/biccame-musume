import { atom } from 'jotai'

/**
 * URLを持たない一覧用のページ状態。イベントルートはsearch.pageを使用する。
 * 過去の永続ページをURLなしの初訪問へ引き継がない。
 */
export const eventPageAtom = atom(1)
