import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Suspense } from 'react'
import { AppBreadcrumb } from '@/components/common/breadcrumb'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { CommentSection } from '@/components/events/comments/comment-section'
import { EventDetailHeader } from '@/components/events/event-detail-header'
import { EventDetailInfo } from '@/components/events/event-detail-info'
import { RecentEventsList } from '@/components/events/recent-events-list'
import { Separator } from '@/components/ui/separator'
import { useCloudflareAccess } from '@/hooks/use-cloudflare-access'
import { useEvent, useEvents } from '@/hooks/use-events'

/**
 * イベント詳細ページのコンテンツ
 */
const EventDetailContent = () => {
  const { uuid } = Route.useParams()
  const router = useRouter()
  const { data: event } = useEvent(uuid)
  const { data: allEvents } = useEvents()
  const { isAuthenticated } = useCloudflareAccess()

  return (
    <div className='min-h-screen'>
      <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-6xl'>
        <AppBreadcrumb
          items={[{ label: 'ホーム', to: '/' }, { label: 'イベント', to: '/events' }, { label: event.title }]}
        />
        <div className='md:grid md:grid-cols-[1fr_auto_320px] md:gap-6'>
          {/* メインコンテンツ */}
          <div className='max-w-2xl'>
            <EventDetailHeader event={event} isAuthenticated={isAuthenticated} onBack={() => router.history.back()} />
            <EventDetailInfo event={event} />

            {/* コメント */}
            <div className='mt-8'>
              <Separator className='mb-6' />
              <CommentSection eventUuid={uuid} />
            </div>

            {/* 関連イベント（モバイルのみ） */}
            <div className='md:hidden mt-6'>
              <Separator className='mb-6' />
              <RecentEventsList events={allEvents} currentEventId={uuid} />
            </div>
          </div>

          {/* Separator */}
          <Separator orientation='vertical' className='hidden md:block' />

          {/* サイドバー（デスクトップのみ） */}
          <div className='hidden md:block pt-4'>
            <div className='sticky top-4'>
              <RecentEventsList events={allEvents} currentEventId={uuid} />
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

export const Route = createFileRoute('/events/$uuid/')({
  component: RouteComponent
})
