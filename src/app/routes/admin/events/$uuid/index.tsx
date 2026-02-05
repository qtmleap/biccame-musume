import { createFileRoute, notFound, useRouter, useSearch } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { ArrowLeft } from 'lucide-react'
import { Suspense } from 'react'
import type { DefaultValues } from 'react-hook-form'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { EventForm } from '@/components/admin/event-form'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Button } from '@/components/ui/button'
import { useEventOrNull } from '@/hooks/useEvents'
import { type EventCategory, type EventRequest, EventRequestQuerySchema } from '@/schemas/event.dto'
import type { StoreKey } from '@/schemas/store.dto'

/**
 * イベントデータをフォーム値に変換
 */
const toFormValues = (event: NonNullable<ReturnType<typeof useEventOrNull>['data']>): DefaultValues<EventRequest> => ({
  uuid: event.uuid,
  category: event.category,
  title: event.title,
  referenceUrls: event.referenceUrls || [],
  stores: event.stores || [],
  limitedQuantity: event.limitedQuantity,
  startDate: dayjs(event.startDate).format('YYYY-MM-DD'),
  endDate: event.endDate ? dayjs(event.endDate).format('YYYY-MM-DD') : undefined,
  endedAt: event.endedAt ? dayjs(event.endedAt).format('YYYY-MM-DD') : undefined,
  conditions: event.conditions,
  isVerified: event.isVerified ?? false,
  isPreliminary: event.isPreliminary ?? false,
  shouldTweet: false
})

/**
 * イベント編集/新規作成画面のコンテンツ
 */
const EditEventContent = () => {
  const { uuid } = Route.useParams()
  const router = useRouter()
  const search = useSearch({ from: '/admin/events/$uuid/' })
  const { data: event } = useEventOrNull(uuid)

  // 編集モードか新規作成モードかを判定
  const isEditMode = !!event

  // デフォルト値を生成
  const defaultValues: DefaultValues<EventRequest> = event
    ? toFormValues(event)
    : {
        uuid,
        category: search.category as EventCategory,
        title: search.title,
        stores: search.stores ? (search.stores.split(',').map((s) => s.trim()) as StoreKey[]) : undefined,
        referenceUrls: search.referenceUrls
          ? search.referenceUrls.split(',').map((url) => ({
              uuid: uuidv4(),
              type: 'announce' as const,
              url: url.trim()
            }))
          : undefined,
        startDate: search.startDate,
        endDate: search.endDate,
        endedAt: search.endAt,
        // クエリパラメータがある場合は投稿フラグをデフォルトでfalseに
        shouldTweet: Object.keys(search).length > 0 ? false : undefined
      }

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
        <h1 className='text-2xl font-bold text-gray-900'>{isEditMode ? 'イベント編集' : '新規イベント登録'}</h1>
        <p className='mt-2 text-sm text-gray-600 md:text-base'>
          {isEditMode ? 'イベント情報を編集' : 'アクキー配布などのイベント情報を入力'}
        </p>
      </div>

      {/* イベント編集/新規作成フォーム */}
      <div>
        <EventForm defaultValues={defaultValues} onSuccess={handleSuccess} isEditMode={isEditMode} />
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
  validateSearch: EventRequestQuerySchema,
  beforeLoad: ({ params }) => {
    const result = z.uuid().safeParse(params.uuid)
    if (!result.success) {
      throw notFound()
    }
  }
})
