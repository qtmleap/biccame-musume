import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Suspense } from 'react'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { EventDetailHeader } from '@/components/events/event-detail-header'
import { EventDetailInfo } from '@/components/events/event-detail-info'
import { RecentEventsList } from '@/components/events/recent-events-list'
import { Separator } from '@/components/ui/separator'
import { useCloudflareAccess } from '@/hooks/useCloudflareAccess'
import { useEvent, useEvents } from '@/hooks/useEvents'

/**
 * イベント詳細ページのコンテンツ
 */
const EventDetailContent = () => {
  const { eventId } = Route.useParams()
  const navigate = useNavigate()
  const { data: event } = useEvent(eventId)
  const { data: allEvents } = useEvents()
  const { isAuthenticated } = useCloudflareAccess()

  return (
    <div className='min-h-screen bg-pink-50'>
      <div className='mx-auto px-4 py-4 md:px-8 max-w-6xl'>
        <div className='md:grid md:grid-cols-[1fr_auto_320px] md:gap-6'>
          {/* メインコンテンツ */}
          <div className='max-w-2xl'>
            <EventDetailHeader
              event={event}
              isAuthenticated={isAuthenticated}
              onBack={() => navigate({ to: '/events' })}
            />
            <EventDetailInfo event={event} />
          </div>

          {/* Separator */}
          <Separator orientation='vertical' className='hidden md:block' />

          {/* サイドバー（デスクトップのみ） */}
          <div className='hidden md:block pt-4'>
            <div className='sticky top-4'>
              <RecentEventsList events={allEvents} currentEventId={eventId} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * ルートコンポーネント
 */
const RouteComponent = () => (
  <Suspense fallback={<LoadingFallback />}>
    <EventDetailContent />
  </Suspense>
)

export const Route = createFileRoute('/events/$eventId')({
  component: RouteComponent
})
