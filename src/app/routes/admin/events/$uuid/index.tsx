import { createFileRoute, useRouter, useSearch } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Suspense } from 'react'
import type { DefaultValues } from 'react-hook-form'
import { EventForm } from '@/components/admin/event-form'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Button } from '@/components/ui/button'
import { useEventOrNull } from '@/hooks/useEvents'
import { type EventCategory, type EventRequest, EventRequestQuerySchema } from '@/schemas/event.dto'
import type { StoreKey } from '@/schemas/store.dto'

/**
 * イベント編集/新規作成画面のコンテンツ
 */
const EditEventContent = () => {
  const { uuid } = Route.useParams()
  const router = useRouter()
  const search = useSearch({ from: '/admin/events/$uuid/' })
  const { data } = useEventOrNull(uuid)

  const event: DefaultValues<EventRequest> = {
    ...data,
    category: search.category as EventCategory,
    title: search.title,
    stores: (search.stores ? search.stores.split(',').map((s) => s.trim()) : undefined) as StoreKey[],
    startDate: search.startDate,
    endDate: search.endDate,
    endedAt: search.endAt
  }

  console.log(search)

  const handleSuccess = () => {
    router.history.back()
  }

  return (
    <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-6xl'>
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
        <h1 className='text-2xl font-bold text-gray-900'>{event ? 'イベント編集' : '新規イベント登録'}</h1>
        <p className='mt-2 text-sm text-gray-600 md:text-base'>
          {event ? 'イベント情報を編集' : 'アクキー配布などのイベント情報を入力'}
        </p>
      </div>

      {/* イベント編集/新規作成フォーム */}
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

export const Route = createFileRoute('/admin/events/$uuid/')({
  component: EditEventPage,
  validateSearch: EventRequestQuerySchema
})
