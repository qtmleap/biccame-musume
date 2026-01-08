import { createFileRoute, useRouter } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Suspense } from 'react'
import { EventForm } from '@/components/admin/event-form'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Button } from '@/components/ui/button'

/**
 * イベント新規作成画面のコンテンツ
 */
const NewEventContent = () => {
  const router = useRouter()

  const handleSuccess = () => {
    router.history.back()
  }

  return (
    <div className='container mx-auto max-w-4xl px-4 py-6 md:py-8'>
      {/* ヘッダー */}
      <div className='mb-6 md:mb-8'>
        <Button variant='ghost' size='sm' className='mb-4' onClick={() => router.history.back()}>
          <ArrowLeft className='mr-2 size-4' />
          戻る
        </Button>
        <h1 className='text-2xl font-bold text-gray-900 md:text-3xl'>新規イベント登録</h1>
        <p className='mt-2 text-sm text-gray-600 md:text-base'>アクキー配布などのイベント情報を入力</p>
      </div>

      {/* イベント登録フォーム */}
      <div>
        <EventForm onSuccess={handleSuccess} />
      </div>
    </div>
  )
}

/**
 * イベント新規作成ページ
 */
const NewEventPage = () => {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <NewEventContent />
    </Suspense>
  )
}

export const Route = createFileRoute('/admin/events/new/')({
  component: NewEventPage
})
