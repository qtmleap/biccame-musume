import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft, Award, Heart } from 'lucide-react'
import { Suspense, useState } from 'react'
import { ErrorBoundary } from '@/components/common/error-boundary'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { PaginatedEventGrid } from '@/components/events/paginated-event-grid'
import { Button } from '@/components/ui/button'
import { useEvents } from '@/hooks/use-events'
import { useUserActivity } from '@/hooks/use-user-activity'
import { auth } from '@/lib/firebase'
import { MY_PAGE_LABELS } from '@/locales/app.content'

/**
 * 気になるイベント一覧コンテンツ
 */
const InterestedEventsContent = () => {
  const router = useRouter()
  const { interestedEvents } = useUserActivity()
  const { data: allEvents } = useEvents()
  const [page, setPage] = useState(1)

  // イベントIDからイベント詳細を取得
  const interestedEventDetails = allEvents.filter((e) => interestedEvents.includes(e.uuid))

  return (
    <div className='min-h-screen bg-page-bg'>
      <div className='mx-auto px-4 py-4 md:py-6 md:px-8 max-w-6xl'>
        {/* ヘッダー */}
        <div className='mb-6'>
          <Button
            variant='ghost'
            size='sm'
            className='text-muted-foreground hover:text-foreground -ml-2 mb-4 border border-transparent'
            onClick={() => router.history.back()}
          >
            <ArrowLeft className='h-4 w-4 mr-1' />
            戻る
          </Button>
          <div className='flex items-center gap-2'>
            <Heart className='h-6 w-6 text-action-interest' />
            <h1 className='text-2xl font-bold text-foreground'>{MY_PAGE_LABELS.interestedEvents}</h1>
            <span className='text-sm text-muted-foreground'>({interestedEventDetails.length})</span>
          </div>

          {/* タブナビゲーション */}
          <div className='mt-4 flex border-b border-border'>
            <Link
              to='/me/interested'
              className='flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 border-brand text-brand'
            >
              <Heart className='h-4 w-4' />
              気になる
            </Link>
            <Link
              to='/me/completed'
              className='flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground transition-colors'
            >
              <Award className='h-4 w-4' />
              達成済みを見る
            </Link>
          </div>
        </div>

        {/* イベント一覧 */}
        <PaginatedEventGrid
          events={interestedEventDetails}
          page={page}
          onPageChange={setPage}
          emptyState={
            <div className='bg-card rounded-lg shadow-sm p-8 text-center'>
              <Heart className='h-12 w-12 text-muted-foreground/30 mx-auto mb-3' />
              <p className='text-muted-foreground'>{MY_PAGE_LABELS.noInterestedEvents}</p>
              <Link to='/events' className='inline-block mt-4 text-brand hover:text-brand text-sm font-medium'>
                {MY_PAGE_LABELS.findEvents}
              </Link>
            </div>
          }
        />
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
  component: RouteComponent,
  beforeLoad: async () => {
    return new Promise((resolve) => {
      const unsubscribe = auth.onAuthStateChanged((user) => {
        unsubscribe()
        if (!user) {
          throw new Error('Unauthorized')
        }
        resolve(undefined)
      })
    })
  },
  onError: ({ error, navigate }) => {
    if (error.message === 'Unauthorized') {
      navigate({ to: '/' })
    }
  }
})
