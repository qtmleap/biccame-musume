import { atom } from 'jotai'
import type { Event } from '@/schemas/event.dto'

/**
 * カテゴリフィルター用atom
 * デフォルトは全カテゴリを選択状態
 */
export const categoryFilterAtom = atom<Set<Event['category']>>(
  new Set(['ackey', 'limited_card', 'regular_card', 'other'])
)
