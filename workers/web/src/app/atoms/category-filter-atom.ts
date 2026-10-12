import type { Event } from '@biccame/shared/schemas/event.dto'
import { atom } from 'jotai'

/**
 * カテゴリフィルター用atom
 * デフォルトは全カテゴリを選択状態
 */
export const categoryFilterAtom = atom<Set<Event['category']>>(
  new Set(['ackey', 'acsta', 'limited_card', 'regular_card', 'other'] as Event['category'][])
)
