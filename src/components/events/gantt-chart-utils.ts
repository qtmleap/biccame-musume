import { CATEGORY_BG_COLOR } from '@/locales/component.content'
import type { Event, EventStatus } from '@/schemas/event.dto'

/**
 * カテゴリに応じた背景色クラスを返す
 */
export const getCategoryColor = (category: Event['category'], status: EventStatus): string => {
  if (status === 'ended') {
    return 'bg-gray-400 opacity-60'
  }
  return CATEGORY_BG_COLOR[category]
}

/**
 * スクロールバーを非表示にするスタイル（Chrome/Safari用）
 */
export const hideScrollbarStyle = `
  .gantt-scroll-container::-webkit-scrollbar {
    display: none;
  }
`
