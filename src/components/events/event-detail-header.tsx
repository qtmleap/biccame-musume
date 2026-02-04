import { Link } from '@tanstack/react-router'
import { ArrowLeft, Pencil } from 'lucide-react'
import { motion } from 'motion/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EVENT_CATEGORY_LABELS } from '@/locales/app.content'
import { CATEGORY_STYLE, STATUS_BADGE_DETAIL } from '@/locales/component.content'
import type { Event } from '@/schemas/event.dto'

type EventDetailHeaderProps = {
  event: Event
  isAuthenticated: boolean
  onBack?: () => void
}

/**
 * イベント詳細ページのヘッダーコンポーネント
 */
export const EventDetailHeader = ({ event, isAuthenticated, onBack }: EventDetailHeaderProps) => {
  const categoryStyle = CATEGORY_STYLE[event.category]

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
        key={`header-${event.uuid}`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className='mb-6'
      >
        <div className='flex items-center gap-2 mb-2'>
          <Badge className={`${categoryStyle} border`}>{EVENT_CATEGORY_LABELS[event.category]}</Badge>
          {STATUS_BADGE_DETAIL[event.status]()}
        </div>
        <div className='flex items-center justify-between gap-4'>
          <h1 className='text-2xl font-bold text-gray-900'>{event.title}</h1>
          {isAuthenticated && (
            <Button
              asChild
              size='sm'
              className='rounded-full px-4 h-7 text-xs font-semibold bg-transparent text-gray-900 border border-gray-300 hover:bg-gray-100'
            >
              <Link to='/admin/events/$uuid' params={{ uuid: event.uuid }}>
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
