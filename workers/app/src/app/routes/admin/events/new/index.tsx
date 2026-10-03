import { createFileRoute, useRouter, useSearch } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Suspense, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { EventForm } from '@/components/admin/event-form'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Button } from '@/components/ui/button'
import { useEventOrNull } from '@/hooks/use-events'
import { toCopyFormValues, toFormValuesFromQuery } from '@/lib/event-form'
import { ADMIN_LABELS } from '@/locales/app.content'
import { EventRequestQuerySchema } from '@/schemas/event.dto'

const NewEventContent = () => {
  const router = useRouter()
  const search = useSearch({ from: '/admin/events/new/' })
  const [newUuid] = useState(() => uuidv4())
  const { data: copySource, isPending, isError, refetch } = useEventOrNull(search.from ?? '')

  if (isPending) return <LoadingFallback />
  if (isError) {
    return (
      <div className='mx-auto max-w-6xl px-4 py-12 text-center' role='alert'>
        <p>コピー元イベントの取得に失敗しました</p>
        <Button className='mt-4' variant='outline' onClick={() => refetch()}>
          再試行
        </Button>
      </div>
    )
  }
  if (search.from && copySource === null) {
    return (
      <div className='mx-auto max-w-6xl px-4 py-12 text-center' role='status'>
        <p>コピー元イベントが見つかりません</p>
        <Button
          className='mt-4'
          variant='outline'
          onClick={() => router.navigate({ to: '/admin/events/new', search: {} })}
        >
          新規登録へ
        </Button>
      </div>
    )
  }

  const isCopyMode = search.from !== undefined && copySource !== null

  const defaultValues =
    isCopyMode && copySource ? toCopyFormValues(copySource, newUuid) : toFormValuesFromQuery(search, newUuid)

  const handleSuccess = () => {
    // 作成画面を履歴に残すとブラウザバックで送信済みフォームに戻るため置き換える
    router.navigate({ to: '/admin/events', replace: true })
  }

  const headerTitle = isCopyMode ? ADMIN_LABELS.eventCopy : ADMIN_LABELS.eventNew
  const headerDesc = isCopyMode ? ADMIN_LABELS.eventCopyDesc : ADMIN_LABELS.eventNewDesc

  return (
    <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-6xl'>
      <div className='mb-6 md:mb-8'>
        <Button
          variant='ghost'
          size='sm'
          className='text-muted-foreground hover:text-foreground -ml-2 mb-4'
          onClick={() => router.history.back()}
        >
          <ArrowLeft className='h-4 w-4 mr-1' />
          戻る
        </Button>
        <h1 className='text-2xl font-bold text-foreground'>{headerTitle}</h1>
        <p className='mt-2 text-sm text-muted-foreground md:text-base'>{headerDesc}</p>
      </div>

      <div>
        <EventForm defaultValues={defaultValues} onSuccess={handleSuccess} isEditMode={false} mode='create' />
      </div>
    </div>
  )
}

const NewEventPage = () => {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <NewEventContent />
    </Suspense>
  )
}

export const Route = createFileRoute('/admin/events/new/')({
  component: NewEventPage,
  validateSearch: EventRequestQuerySchema
})
