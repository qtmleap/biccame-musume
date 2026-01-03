import { createFileRoute, Link } from '@tanstack/react-router'
import { Suspense } from 'react'
import { EventList } from '@/components/admin/event-list'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Button } from '@/components/ui/button'
import { useCloudflareAccess } from '@/hooks/useCloudflareAccess'

/**
 * イベント管理画面のコンテンツ
 */
const EventsContent = () => {
  const { isAuthenticated } = useCloudflareAccess()

  return (
    <div className='container mx-auto max-w-4xl px-4 py-6 md:py-8'>
      {/* ヘッダー */}
      <div className='mb-6 md:mb-8'>
        <div className='flex items-start justify-between gap-4'>
          <div className='flex-1'>
            <h1 className='text-2xl font-bold text-gray-900 md:text-3xl'>イベント管理</h1>
            <p className='mt-2 text-sm text-gray-600 md:text-base'>アクキー配布などのイベントを登録・管理</p>
          </div>
          {isAuthenticated && (
            <Link to='/admin/events/new'>
              <Button className='bg-red-500 hover:bg-red-600'>新規作成</Button>
            </Link>
          )}
        </div>
      </div>

      {/* イベント一覧 */}
      <div>
        <EventList />
      </div>
    </div>
  )
}

/**
 * イベント管理ページ
 */
const EventsPage = () => {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <EventsContent />
    </Suspense>
  )
}

export const Route = createFileRoute('/admin/events/')({
  component: EventsPage
})
