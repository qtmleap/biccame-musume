import { Link } from '@tanstack/react-router'
import { ArrowLeft, Pencil } from 'lucide-react'
import { motion } from 'motion/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EVENT_CATEGORY_LABELS, EVENT_STATUS_LABELS } from '@/locales/app.content'
import type { Event, EventCategory, EventStatus } from '@/schemas/event.dto'

type EventDetailHeaderProps = {
  event: Event
  isAuthenticated: boolean
  onBack?: () => void
}

/**
 * カテゴリに応じたスタイルを返す
 */
const getCategoryStyle = (category: EventCategory) => {
  switch (category) {
    case 'limited_card':
      return 'bg-purple-100 text-purple-700 border-purple-300'
    case 'regular_card':
      return 'bg-blue-100 text-blue-700 border-blue-300'
    case 'ackey':
      return 'bg-amber-100 text-amber-700 border-amber-300'
    default:
      return 'bg-pink-100 text-pink-700 border-pink-300'
  }
}

/**
 * ステータスバッジを取得
 */
const getStatusBadge = (status: EventStatus) => {
  switch (status) {
    case 'ongoing':
      return (
        <Badge className='bg-green-100 text-green-700 border-green-300 border'>{EVENT_STATUS_LABELS[status]}</Badge>
      )
    case 'last_day':
      return <Badge className='bg-red-100 text-red-700 border-red-300 border'>{EVENT_STATUS_LABELS[status]}</Badge>
    case 'ended':
      return <Badge className='bg-gray-100 text-gray-700 border-gray-300 border'>{EVENT_STATUS_LABELS[status]}</Badge>
    case 'upcoming':
      return <Badge className='bg-blue-100 text-blue-700 border-blue-300 border'>{EVENT_STATUS_LABELS[status]}</Badge>
  }
}

/**
 * イベント詳細ページのヘッダーコンポーネント
 */
export const EventDetailHeader = ({ event, isAuthenticated, onBack }: EventDetailHeaderProps) => {
  const categoryStyle = getCategoryStyle(event.category)

  return (
    <>
      {/* 戻るボタン */}
      {onBack && (
        <div className='pb-2'>
          <Button variant='ghost' size='sm' className='text-gray-600 hover:text-gray-900 -ml-2' onClick={onBack}>
            <ArrowLeft className='h-4 w-4 mr-1' />
            戻る
          </Button>
        </div>
      )}

      {/* ヘッダー */}
      <motion.div
        key={`header-${event.id}`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className='mb-6'
      >
        <div className='flex items-center gap-2 mb-2'>
          <Badge className={`${categoryStyle} border`}>{EVENT_CATEGORY_LABELS[event.category]}</Badge>
          {getStatusBadge(event.status)}
        </div>
        <div className='flex items-center justify-between gap-4'>
          <h1 className='text-2xl font-bold text-gray-900'>{event.name}</h1>
          {isAuthenticated && (
            <Button
              asChild
              size='sm'
              className='rounded-full px-4 h-7 text-xs font-semibold bg-transparent text-gray-900 border border-gray-300 hover:bg-gray-100'
            >
              <Link to='/admin/events/$id/edit' params={{ id: event.id }}>
                <Pencil className='h-3.5 w-3.5 mr-1' />
                編集
              </Link>
            </Button>
          )}
        </div>
      </motion.div>
    </>
  )
}
