import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, Heart } from 'lucide-react'
import { Suspense } from 'react'
import { ErrorBoundary } from '@/components/common/error-boundary'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { EventGridItem } from '@/components/events/event-grid-item'
import { useEvents } from '@/hooks/use-events'
import { useUserActivity } from '@/hooks/use-user-activity'
import { MY_PAGE_LABELS } from '@/locales/app.content'

/**
 * 気になるイベント一覧コンテンツ
 */
const InterestedEventsContent = () => {
  const { interestedEvents } = useUserActivity()
  const { data: allEvents } = useEvents()

  // イベントIDからイベント詳細を取得
  const interestedEventDetails = allEvents.filter((e) => interestedEvents.includes(e.uuid))

  return (
    <div className='min-h-screen bg-pink-50'>
      <div className='mx-auto px-4 py-4 md:py-6 md:px-8 max-w-6xl'>
        {/* ヘッダー */}
        <div className='mb-6'>
          <Link
            to='/me'
            className='inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors mb-4'
          >
            <ArrowLeft className='h-4 w-4' />
            {MY_PAGE_LABELS.backToMyPage}
          </Link>
          <div className='flex items-center gap-2'>
            <Heart className='h-6 w-6 text-pink-500' />
            <h1 className='text-2xl font-bold text-gray-900'>{MY_PAGE_LABELS.interestedEvents}</h1>
            <span className='text-sm text-gray-500'>({interestedEventDetails.length})</span>
          </div>
        </div>

        {/* イベント一覧 */}
        {interestedEventDetails.length > 0 ? (
          <div className='grid grid-cols-1 md:grid-cols-3 gap-2'>
            {interestedEventDetails.map((event, index) => (
              <EventGridItem key={event.uuid} event={event} index={index} />
            ))}
          </div>
        ) : (
          <div className='bg-white rounded-lg shadow-sm p-8 text-center'>
            <Heart className='h-12 w-12 text-gray-300 mx-auto mb-3' />
            <p className='text-gray-600'>{MY_PAGE_LABELS.noInterestedEvents}</p>
            <Link to='/events' className='inline-block mt-4 text-pink-600 hover:text-pink-700 text-sm font-medium'>
              {MY_PAGE_LABELS.findEvents}
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * ルートコンポーネント
 */
const RouteComponent = () => (
  <ErrorBoundary>
    <Suspense fallback={<LoadingFallback />}>
      <InterestedEventsContent />
    </Suspense>
  </ErrorBoundary>
)

export const Route = createFileRoute('/me/interested/')({
  component: RouteComponent
})
