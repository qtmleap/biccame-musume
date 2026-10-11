import type { Event } from '@biccame/shared/schemas/event.dto'
import { atom } from 'jotai'

/**
 * イベント一覧のアクティブタブ
 */
export const eventListActiveTabAtom = atom<Event['category']>('limited_card')

/**
 * イベント一覧の各タブのページ番号
 */
export const eventListPagesAtom = atom<Record<Event['category'], number>>({
  limited_card: 1,
  regular_card: 1,
  ackey: 1,
  acsta: 1,
  other: 1
})
