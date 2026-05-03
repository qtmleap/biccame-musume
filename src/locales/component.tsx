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
export const STATUS_BADGE_SM = {
  upcoming: () => <Badge variant='secondary'>開催前</Badge>,
  ongoing: () => <Badge>開催中</Badge>,
  last_day: () => <Badge variant='destructive'>最終日</Badge>,
  ended: () => <Badge variant='outline'>終了</Badge>
} satisfies Record<EventStatus, () => React.ReactNode>

/**
 * ステータスバッジ（詳細ページ用）
 * event-detail-header.tsxで使用
 */
export const STATUS_BADGE_DETAIL = {
  upcoming: () => <Badge variant='secondary'>開催前</Badge>,
  ongoing: () => <Badge>開催中</Badge>,
  last_day: () => <Badge variant='destructive'>最終日</Badge>,
  ended: () => <Badge variant='outline'>終了</Badge>
} satisfies Record<EventStatus, () => React.ReactNode>

/**
 * カテゴリスタイル（アイコン付き）
 * event-list-item.tsxで使用
 */
export const CATEGORY_WITH_ICON = {
  limited_card: {
    icon: <CreditCard className='size-4' />,
    className: 'bg-purple-100 text-purple-600'
  },
  regular_card: {
    icon: <CreditCard className='size-4' />,
    className: 'bg-blue-100 text-blue-600'
  },
  ackey: {
    icon: <KeyRound className='size-4' />,
    className: 'bg-amber-100 text-amber-600'
  },
  other: {
    icon: <Gift className='size-4' />,
    className: 'bg-pink-100 text-pink-600'
  }
} satisfies Record<EventCategory, { icon: React.ReactNode; className: string }>

/**
 * カテゴリ背景色（ガントチャート用）
 * gantt-chart-utils.tsで使用
 */
export const CATEGORY_BG_COLOR = {
  limited_card: 'bg-purple-700',
  regular_card: 'bg-blue-600',
  ackey: 'bg-amber-600',
  other: 'bg-pink-600'
} satisfies Record<EventCategory, string>
