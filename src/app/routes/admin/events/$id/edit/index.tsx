import { createFileRoute, useRouter } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Suspense } from 'react'
import { EventForm } from '@/components/admin/event-form'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Button } from '@/components/ui/button'
import { useEvent } from '@/hooks/useEvents'

/**
 * イベント編集画面のコンテンツ
 */
const EditEventContent = () => {
  const { id } = Route.useParams()
  const router = useRouter()
  const { data: event } = useEvent(id)

  const handleSuccess = () => {
    router.history.back()
  }

  return (
    <div className='mx-auto px-4 py-4 md:px-8 max-w-6xl'>
      {/* ヘッダー */}
      <div className='mb-6 md:mb-8'>
        <Button
          variant='ghost'
          size='sm'
          className='text-gray-600 hover:text-gray-900 -ml-2 mb-4'
          onClick={() => router.history.back()}
        >
          <ArrowLeft className='h-4 w-4 mr-1' />
          戻る
        </Button>
        <h1 className='text-2xl font-bold text-gray-900'>イベント編集</h1>
        <p className='mt-2 text-sm text-gray-600 md:text-base'>イベント情報を編集</p>
      </div>

      {/* イベント編集フォーム */}
      <div>
        <EventForm event={event} onSuccess={handleSuccess} />
      </div>
    </div>
  )
}

/**
 * イベント編集ページ
 */
const EditEventPage = () => {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <EditEventContent />
    </Suspense>
  )
}

export const Route = createFileRoute('/admin/events/$id/edit/')({
  component: EditEventPage
})
