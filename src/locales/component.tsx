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
  upcoming: () => (
    <Badge variant='outline' className='border-blue-600 bg-blue-50 text-blue-700'>
      開催前
    </Badge>
  ),
  ongoing: () => (
    <Badge variant='outline' className='border-green-600 bg-green-50 text-green-700'>
      開催中
    </Badge>
  ),
  last_day: () => (
    <Badge variant='outline' className='border-orange-600 bg-orange-50 text-orange-700'>
      最終日
    </Badge>
  ),
  ended: () => <Badge variant='secondary'>終了</Badge>
} satisfies Record<EventStatus, () => React.ReactNode>

/**
 * ステータスバッジ（小サイズ）
 * event-grid-item.tsxで使用
 */
export const STATUS_BADGE_SM = {
  upcoming: () => (
    <Badge variant='outline' className='border-blue-600 bg-blue-50 text-blue-700 text-xs'>
      開催前
    </Badge>
  ),
  ongoing: () => (
    <Badge variant='outline' className='border-green-600 bg-green-50 text-green-700 text-xs'>
      開催中
    </Badge>
  ),
  last_day: () => (
    <Badge variant='outline' className='border-red-600 bg-red-50 text-red-700 text-xs'>
      最終日
    </Badge>
  ),
  ended: () => (
    <Badge variant='secondary' className='text-xs'>
      終了
    </Badge>
  )
} satisfies Record<EventStatus, () => React.ReactNode>

/**
 * ステータスバッジ（詳細ページ用）
 * event-detail-header.tsxで使用
 */
export const STATUS_BADGE_DETAIL = {
  upcoming: () => <Badge className='bg-blue-100 text-blue-700 border-blue-300 border'>開催前</Badge>,
  ongoing: () => <Badge className='bg-green-100 text-green-700 border-green-300 border'>開催中</Badge>,
  last_day: () => <Badge className='bg-red-100 text-red-700 border-red-300 border'>最終日</Badge>,
  ended: () => <Badge className='bg-gray-100 text-gray-700 border-gray-300 border'>終了</Badge>
} satisfies Record<EventStatus, () => React.ReactNode>

/**
 * カテゴリスタイル（詳細ページ用）
 * event-detail-header.tsxで使用
 */
export const CATEGORY_STYLE = {
  limited_card: 'bg-purple-100 text-purple-700 border-purple-300',
  regular_card: 'bg-blue-100 text-blue-700 border-blue-300',
  ackey: 'bg-amber-100 text-amber-700 border-amber-300',
  other: 'bg-pink-100 text-pink-700 border-pink-300'
} satisfies Record<EventCategory, string>

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
