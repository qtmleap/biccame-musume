import { createFileRoute, useRouter, useSearch } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { ArrowLeft } from 'lucide-react'
import { Suspense } from 'react'
import { z } from 'zod'
import { EventForm } from '@/components/admin/event-form'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Button } from '@/components/ui/button'
import { EventRequestSchema } from '@/schemas/event.dto'
import type { EventFormValues } from '@/schemas/event-form.dto'

/**
 * クエリパラメータのスキーマ定義
 * EventRequestSchemaの一部フィールドを文字列として受け取る
 */
const EventNewSearchSchema = z.object({
  category: EventRequestSchema.shape.category.optional(),
  name: z.string().optional(),
  stores: z.string().optional(),
  referenceUrls: z.string().optional(),
  startDate: EventRequestSchema.shape.startDate.optional(),
  endDate: EventRequestSchema.shape.endDate.optional()
})

/**
 * イベント新規作成画面のコンテンツ
 */
const NewEventContent = () => {
  const router = useRouter()
  const search = useSearch({ from: '/admin/events/new/' })

  const handleSuccess = () => {
    router.history.back()
  }

  // クエリパラメータを変換してdefaultValuesを作成
  const hasQueryParams = Object.keys(search).length > 0
  const parseDate = (date: Date | undefined) => {
    if (!date) return undefined
    const parsed = dayjs(date)
    return parsed.isValid() ? parsed.format('YYYY-MM-DD') : undefined
  }
  const defaultValues: Partial<EventFormValues> = {
    category: search.category,
    name: search.name,
    stores: search.stores ? search.stores.split(',').map((s) => s.trim()) : undefined,
    referenceUrls: search.referenceUrls
      ? search.referenceUrls.split(',').map((url) => ({
          id: crypto.randomUUID(),
          type: 'announce' as const,
          url: url.trim()
        }))
      : undefined,
    startDate: parseDate(search.startDate),
    endDate: parseDate(search.endDate),
    // クエリパラメータから読み込んだ場合はツイートしない
    shouldTweet: hasQueryParams ? false : undefined
  }

  return (
    <div className='container mx-auto max-w-6xl px-4 py-6 md:py-8'>
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
        <h1 className='text-2xl font-bold text-gray-900 md:text-2xl'>新規イベント登録</h1>
        <p className='mt-2 text-sm text-gray-600 md:text-base'>アクキー配布などのイベント情報を入力</p>
      </div>

      {/* イベント登録フォーム */}
      <div>
        <EventForm onSuccess={handleSuccess} defaultValues={defaultValues} />
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
  component: NewEventPage,
  validateSearch: EventNewSearchSchema
})
