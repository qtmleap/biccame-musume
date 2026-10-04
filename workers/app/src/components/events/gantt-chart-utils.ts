import type { Event, EventStatus } from '@/schemas/event.dto'

/**
 * カテゴリに応じた背景色クラスを返す
 */
export const getCategoryColor = (category: Event['category'], status: EventStatus): string => {
  if (status === 'ended') {
    return 'bg-[var(--gantt-ended)] text-[var(--gantt-foreground)]'
  }
  return {
    limited_card: 'bg-[var(--gantt-limited-card)] text-[var(--gantt-foreground)]',
    regular_card: 'bg-[var(--gantt-regular-card)] text-[var(--gantt-foreground)]',
    ackey: 'bg-[var(--gantt-ackey)] text-[var(--gantt-foreground)]',
    other: 'bg-[var(--gantt-other)] text-[var(--gantt-foreground)]'
  }[category]
}

/**
 * スクロールバーを非表示にするスタイル（Chrome/Safari用）
 */
export const hideScrollbarStyle = `
  .gantt-scroll-container::-webkit-scrollbar {
    display: none;
  }
`
