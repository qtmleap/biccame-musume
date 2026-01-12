import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Suspense } from 'react'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { EventDetailHeader } from '@/components/events/event-detail-header'
import { EventDetailInfo } from '@/components/events/event-detail-info'
import { useCloudflareAccess } from '@/hooks/useCloudflareAccess'
import { useEvent } from '@/hooks/useEvents'

/**
 * イベント詳細ページのコンテンツ
 */
const EventDetailContent = () => {
  const { eventId } = Route.useParams()
  const navigate = useNavigate()
  const { data: event } = useEvent(eventId)
  const { isAuthenticated } = useCloudflareAccess()

  return (
    <div className='min-h-screen bg-pink-50'>
      <div className='container mx-auto px-4 max-w-6xl'>
        <div className='max-w-2xl'>
          <EventDetailHeader
            event={event}
            isAuthenticated={isAuthenticated}
            onBack={() => navigate({ to: '/events' })}
          />
          <EventDetailInfo event={event} />
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
