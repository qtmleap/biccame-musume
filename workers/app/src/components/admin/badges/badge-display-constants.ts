import { ICON_MAP } from '@/lib/badge-icons'

/**
 * バッジカードの rarity チップ背景色 (固色)
 */
export const RARITY_CHIP: Record<string, string> = {
  common: 'bg-muted text-muted-foreground',
  rare: 'bg-status-upcoming text-status-upcoming-foreground',
  epic: 'bg-favorite text-favorite-foreground',
  legendary: 'bg-rank-gold text-rank-gold-foreground',
  mythic: 'bg-gradient-to-br from-rank-mythic-from via-rank-mythic-via to-rank-mythic-to text-rank-mythic-foreground'
}

/**
 * バッジアイコン背景色 (薄色)
 */
export const RARITY_ICON_BG: Record<string, string> = {
  common: 'bg-muted text-muted-foreground',
  rare: 'bg-status-upcoming/30 text-status-upcoming-foreground',
  epic: 'bg-favorite/20 text-favorite',
  legendary: 'bg-rank-gold/20 text-rank-gold-foreground',
  mythic: 'bg-rank-mythic/20 text-rank-mythic'
}

export const ICON_NAMES = Object.keys(ICON_MAP)

/**
 * カテゴリ accent カラー → ドット背景色のマップ
 */
export const ACCENT_DOT: Record<string, string> = {
  'rank-gold': 'bg-rank-gold',
  favorite: 'bg-favorite',
  brand: 'bg-brand',
  'category-limited-card-solid': 'bg-category-limited-card-solid',
  'rank-bronze': 'bg-rank-bronze'
}

/**
 * カテゴリ accent カラー → 文字色のマップ
 */
export const ACCENT_TEXT: Record<string, string> = {
  'rank-gold': 'text-rank-gold',
  favorite: 'text-favorite',
  brand: 'text-brand',
  'category-limited-card-solid': 'text-category-limited-card-solid',
  'rank-bronze': 'text-rank-bronze'
}

/**
 * カテゴリ表示順 (バッジ一覧でセクションが現れる順番)
 */
export const CATEGORY_ORDER: string[] = [
  'store',
  'area',
  'event_clear_store',
  'event_clear_area',
  'milestone',
  'event',
  'conquest',
  'vote',
  'special'
]
