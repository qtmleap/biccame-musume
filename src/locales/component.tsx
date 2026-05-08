import { CreditCard, Gift, KeyRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { EventCategory, EventStatus } from '@/schemas/event.dto'

/**
 * イベントステータス・カテゴリ関連のコンテンツ定義
 * Reactコンポーネントを含むため、IntLayerのコンテンツとしてではなく
 * 通常のモジュールとしてエクスポート
 */

/**
 * ステータスバッジ（デフォルト）
 * event-list.tsxで使用
 */
export const STATUS_BADGE = {
  upcoming: () => <Badge className='bg-status-upcoming text-status-upcoming-foreground'>開催前</Badge>,
  ongoing: () => <Badge className='bg-status-ongoing text-status-ongoing-foreground'>開催中</Badge>,
  last_day: () => <Badge className='bg-status-last-day text-status-last-day-foreground'>最終日</Badge>,
  ended: () => <Badge className='bg-status-ended text-status-ended-foreground'>終了</Badge>
} satisfies Record<EventStatus, () => React.ReactNode>

/**
 * ステータスバッジ（小サイズ）
 * event-grid-item.tsxで使用
 */
export const STATUS_BADGE_SM = STATUS_BADGE

/**
 * ステータスバッジ（詳細ページ用）
 * event-detail-header.tsxで使用
 */
export const STATUS_BADGE_DETAIL = STATUS_BADGE

/**
 * カテゴリバッジ
 * event-detail-header.tsxで使用
 */
export const CATEGORY_BADGE = {
  limited_card: (label: string) => (
    <Badge className='bg-category-limited-card text-category-limited-card-foreground'>{label}</Badge>
  ),
  regular_card: (label: string) => (
    <Badge className='bg-category-regular-card text-category-regular-card-foreground'>{label}</Badge>
  ),
  ackey: (label: string) => <Badge className='bg-category-ackey text-category-ackey-foreground'>{label}</Badge>,
  other: (label: string) => <Badge className='bg-category-other text-category-other-foreground'>{label}</Badge>
} satisfies Record<EventCategory, (label: string) => React.ReactNode>

/**
 * カテゴリスタイル（アイコン付き）
 * event-list-item.tsxで使用
 */
export const CATEGORY_WITH_ICON = {
  limited_card: {
    icon: <CreditCard className='size-4' />,
    className: 'bg-category-limited-card text-category-limited-card-foreground'
  },
  regular_card: {
    icon: <CreditCard className='size-4' />,
    className: 'bg-category-regular-card text-category-regular-card-foreground'
  },
  ackey: {
    icon: <KeyRound className='size-4' />,
    className: 'bg-category-ackey text-category-ackey-foreground'
  },
  other: {
    icon: <Gift className='size-4' />,
    className: 'bg-category-other text-category-other-foreground'
  }
} satisfies Record<EventCategory, { icon: React.ReactNode; className: string }>

/**
 * カテゴリ背景色（ガントチャート用）
 * gantt-chart-utils.tsで使用
 */
export const CATEGORY_BG_COLOR = {
  limited_card: 'bg-category-limited-card-solid',
  regular_card: 'bg-category-regular-card-solid',
  ackey: 'bg-category-ackey-solid',
  other: 'bg-category-other-solid'
} satisfies Record<EventCategory, string>
