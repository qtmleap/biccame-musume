import type { BadgeCategory } from '@/schemas/badge.dto'

export type BadgeCategoryDef = {
  key: BadgeCategory
  label: string
  description: string
  accent: 'rank-gold' | 'favorite' | 'brand' | 'category-limited-card-solid' | 'rank-bronze'
}

export const BADGE_CATEGORY_DEFS: BadgeCategoryDef[] = [
  {
    key: 'store',
    label: '店舗訪問',
    description: '全国のビックカメラを巡って集めよう',
    accent: 'category-limited-card-solid'
  },
  {
    key: 'area',
    label: 'エリア訪問',
    description: '地区ごとの訪問実績を積み重ねよう',
    accent: 'rank-bronze'
  },
  {
    key: 'event_clear_store',
    label: '各店舗でイベント参加',
    description: '店舗ごとのイベント達成で得られる勲章',
    accent: 'brand'
  },
  {
    key: 'event_clear_area',
    label: 'エリアごとのイベント参加',
    description: 'エリア単位のイベント達成実績を積み重ねよう',
    accent: 'rank-bronze'
  },
  {
    key: 'milestone',
    label: '訪問マイルストーン',
    description: '累計訪問数で段階的に解放される称号',
    accent: 'rank-gold'
  },
  {
    key: 'event',
    label: 'イベントマイルストーン',
    description: '累計イベント完了数で段階的に解放される称号',
    accent: 'brand'
  },
  {
    key: 'vote',
    label: '投票マイルストーン',
    description: '推しへの票で積み重なる勲章',
    accent: 'favorite'
  },
  {
    key: 'special',
    label: '特別バッジ',
    description: 'コラボ・限定企画で獲得できるレア称号',
    accent: 'rank-gold'
  }
]

export const BADGE_CATEGORY_MAP = new Map<BadgeCategory, BadgeCategoryDef>(
  BADGE_CATEGORY_DEFS.map((def) => [def.key, def])
)
