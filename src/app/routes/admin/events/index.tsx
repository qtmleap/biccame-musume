import { createFileRoute, Link } from '@tanstack/react-router'
import { Suspense } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { EventList } from '@/components/admin/event-list'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Button } from '@/components/ui/button'
import { useCloudflareAccess } from '@/hooks/use-cloudflare-access'

/**
 * イベント管理画面のコンテンツ
 */
const EventsContent = () => {
  const { isAuthenticated } = useCloudflareAccess()

  return (
    <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-6xl'>
      {/* ヘッダー */}
      <div className='mb-6 md:mb-8'>
        <div className='flex items-start justify-between gap-4'>
          <div className='flex-1'>
            <div className='flex justify-between'>
              <h1 className='text-2xl font-bold text-foreground md:text-2xl'>イベント管理</h1>
              {isAuthenticated && (
                <Link to='/admin/events/$uuid' params={{ uuid: uuidv4() }}>
                  <Button size='sm' className='bg-brand hover:bg-brand/90 text-brand-foreground'>
                    新規作成
                  </Button>
                </Link>
              )}
            </div>
            <p className='mt-2 text-sm text-muted-foreground md:text-base'>アクキー配布などのイベントを登録・管理</p>
          </div>
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
