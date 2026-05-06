import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft, Award, Heart } from 'lucide-react'
import { Suspense, useState } from 'react'
import { AppBreadcrumb } from '@/components/common/breadcrumb'
import { ErrorBoundary } from '@/components/common/error-boundary'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { PaginatedEventGrid } from '@/components/events/paginated-event-grid'
import { Button } from '@/components/ui/button'
import { useEvents } from '@/hooks/use-events'
import { useUserActivity } from '@/hooks/use-user-activity'
import { auth } from '@/lib/firebase'
import { MY_PAGE_LABELS } from '@/locales/app.content'

/**
 * 達成したイベント一覧コンテンツ
 */
const CompletedEventsContent = () => {
  const router = useRouter()
  const { completedEvents } = useUserActivity()
  const { data: allEvents } = useEvents()
  const [page, setPage] = useState(1)

  // イベントIDからイベント詳細を取得
  const completedEventDetails = allEvents.filter((e) => completedEvents.includes(e.uuid))

  return (
    <div className='min-h-screen bg-page-bg'>
      <div className='mx-auto px-4 py-4 md:py-6 md:px-8 max-w-6xl'>
        <AppBreadcrumb
          items={[
            { label: 'ホーム', to: '/' },
            { label: 'マイページ', to: '/me' },
            { label: MY_PAGE_LABELS.completedEvents }
          ]}
        />
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
            <h1 className='text-2xl font-bold text-foreground'>{MY_PAGE_LABELS.completedEvents}</h1>
            <span className='text-sm text-muted-foreground'>({completedEventDetails.length})</span>
          </div>

          {/* タブナビゲーション */}
          <div className='mt-4 flex border-b border-border'>
            <Link
              to='/me/interested'
              className='flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground transition-colors'
            >
              <Heart className='h-4 w-4' />
              気になるを見る
            </Link>
            <Link
              to='/me/completed'
              className='flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 border-action-award text-action-award'
            >
              <Award className='h-4 w-4' />
              達成済み
            </Link>
          </div>
        </div>

        {/* イベント一覧 */}
        <PaginatedEventGrid
          events={completedEventDetails}
          page={page}
          onPageChange={setPage}
          compact
          emptyState={
            <div className='bg-card rounded-lg shadow-sm p-8 text-center'>
              <Award className='h-12 w-12 text-muted-foreground/30 mx-auto mb-3' />
              <p className='text-muted-foreground'>{MY_PAGE_LABELS.noCompletedEvents}</p>
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
      <CompletedEventsContent />
    </Suspense>
  </ErrorBoundary>
)

export const Route = createFileRoute('/me/completed/')({
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
