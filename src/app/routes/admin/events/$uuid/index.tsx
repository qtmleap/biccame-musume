import { createFileRoute, notFound, useRouter, useSearch } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Suspense } from 'react'
import { z } from 'zod'
import { EventForm } from '@/components/admin/event-form'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Button } from '@/components/ui/button'
import { useEventOrNull } from '@/hooks/use-events'
import { toCopyFormValues, toFormValues, toFormValuesFromQuery } from '@/lib/event-form'
import { ADMIN_LABELS } from '@/locales/app.content'
import { EventRequestQuerySchema } from '@/schemas/event.dto'

const EditEventContent = () => {
  const { uuid } = Route.useParams()
  const router = useRouter()
  const search = useSearch({ from: '/admin/events/$uuid/' })
  const { data: event } = useEventOrNull(uuid)
  const { data: copySource } = useEventOrNull(search.from ?? '')

  const isEditMode = !!event
  const isCopyMode = !isEditMode && copySource !== null && search.from !== undefined

  const defaultValues = (() => {
    if (event) return toFormValues(event)
    if (isCopyMode && copySource) return toCopyFormValues(copySource, uuid)
    return toFormValuesFromQuery(search, uuid)
  })()

  const handleSuccess = () => {
    router.navigate({ to: '/admin/events' })
  }

  const headerTitle = isEditMode ? ADMIN_LABELS.eventEdit : isCopyMode ? ADMIN_LABELS.eventCopy : ADMIN_LABELS.eventNew
  const headerDesc = isEditMode
    ? ADMIN_LABELS.eventEditDesc
    : isCopyMode
      ? ADMIN_LABELS.eventCopyDesc
      : ADMIN_LABELS.eventNewDesc

  return (
    <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-6xl'>
      {/* ヘッダー */}
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

      {/* イベント編集/新規作成フォーム */}
      <div>
        <EventForm defaultValues={defaultValues} onSuccess={handleSuccess} isEditMode={isEditMode} />
      </div>
    </div>
  )
}

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
