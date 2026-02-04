import { createFileRoute, useRouter, useSearch } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { ArrowLeft } from 'lucide-react'
import { Suspense } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { EventForm } from '@/components/admin/event-form'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Button } from '@/components/ui/button'
import { useEventOrNull } from '@/hooks/useEvents'
import { EventRequestSchema } from '@/schemas/event.dto'
import type { EventFormValues } from '@/schemas/event-form.dto'

/**
 * クエリパラメータのスキーマ定義
 */
const EventEditSearchSchema = z.object({
  category: EventRequestSchema.shape.category.optional(),
  name: z.string().optional(),
  stores: z.string().optional(),
  referenceUrls: z.string().optional(),
  startDate: EventRequestSchema.shape.startDate.optional(),
  endDate: EventRequestSchema.shape.endDate.optional()
})

/**
 * イベント編集/新規作成画面のコンテンツ
 */
const EditEventContent = () => {
  const { uuid } = Route.useParams()
  const router = useRouter()
  const search = useSearch({ from: '/admin/events/$uuid/' })
  const { data: event } = useEventOrNull(uuid)

  const handleSuccess = () => {
    router.history.back()
  }

  // イベントが存在しない場合、クエリパラメータから初期値を作成
  const hasQueryParams = Object.keys(search).length > 0
  const parseDate = (date: Date | undefined) => {
    if (!date) return undefined
    const parsed = dayjs(date)
    return parsed.isValid() ? parsed.format('YYYY-MM-DD') : undefined
  }

  const defaultValues: Partial<EventFormValues> | undefined = !event
    ? {
        category: search.category,
        name: search.name,
        stores: search.stores ? search.stores.split(',').map((s) => s.trim()) : undefined,
        referenceUrls: search.referenceUrls
          ? search.referenceUrls.split(',').map((url) => ({
              id: uuidv4(),
              type: 'announce' as const,
              url: url.trim()
            }))
          : undefined,
        startDate: parseDate(search.startDate),
        endDate: parseDate(search.endDate),
        shouldTweet: hasQueryParams ? false : undefined,
        id: uuid
      }
    : undefined

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
        <EventForm event={event} onSuccess={handleSuccess} defaultValues={defaultValues} />
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
  validateSearch: EventEditSearchSchema
})
