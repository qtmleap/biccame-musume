import { atomWithStorage } from 'jotai/utils'

/**
 * イベント一覧のページネーション状態を管理するatom
 */
export const eventPageAtom = atomWithStorage('event-page', 1)
