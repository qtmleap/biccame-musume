import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { motion } from 'motion/react'
import { Suspense } from 'react'
import { Button } from '@/components/ui/button'
import { DURATION } from '@/lib/motion'
import { EVENT_CATEGORY_LABELS } from '@/locales/app.content'
import { CATEGORY_BADGE, STATUS_BADGE_DETAIL } from '@/locales/component'
import type { Event } from '@/schemas/event.dto'
import { EventStatsBadges } from './event-stats-badges'

type EventDetailHeaderProps = {
  event: Event
  isAuthenticated: boolean
  onBack?: () => void
}

/**
 * イベント詳細ページのヘッダーコンポーネント
 */
export const EventDetailHeader = ({ event, isAuthenticated, onBack }: EventDetailHeaderProps) => {
  const queryClient = useQueryClient()

  const handleStatsUpdate = () => {
    queryClient.invalidateQueries({ queryKey: ['events', event.uuid] })
  }

  return (
    <>
      {/* 戻るボタン */}
      {onBack && (
        <div className='pb-2'>
          <Button
            variant='ghost'
            size='sm'
            className='text-muted-foreground hover:text-foreground -ml-2 border border-transparent'
            onClick={onBack}
          >
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
        transition={{ duration: DURATION.normal, delay: 0.1 }}
        className='mb-6'
      >
        <div className='flex items-center justify-between gap-2 mb-2'>
          <div className='flex items-center gap-2'>
            {CATEGORY_BADGE[event.category](EVENT_CATEGORY_LABELS[event.category])}
            {STATUS_BADGE_DETAIL[event.status]()}
          </div>
          {isAuthenticated && (
            <Button
              asChild
              size='sm'
              variant='outline'
              className='h-auto px-2.5 py-0.5 text-xs rounded-full border-brand/50 text-brand hover:bg-brand/10 hover:text-brand'
            >
              <Link to='/admin/events/$uuid/edit' params={{ uuid: event.uuid }}>
                編集
              </Link>
            </Button>
          )}
        </div>
        <h1 className='text-2xl font-bold text-foreground'>{event.title}</h1>
        <Suspense fallback={null}>
          <EventStatsBadges event={event} onStatsUpdate={handleStatsUpdate} />
        </Suspense>
      </motion.div>
    </>
  )
}
