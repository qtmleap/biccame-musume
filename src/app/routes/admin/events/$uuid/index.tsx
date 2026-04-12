import { createFileRoute, notFound, useRouter, useSearch } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Suspense } from 'react'
import { z } from 'zod'
import { EventForm } from '@/components/admin/event-form'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Button } from '@/components/ui/button'
import { useEventOrNull } from '@/hooks/use-events'
import { toFormValues, toFormValuesFromQuery } from '@/lib/event-form'
import { ADMIN_LABELS } from '@/locales/app.content'
import { EventRequestQuerySchema } from '@/schemas/event.dto'

const EditEventContent = () => {
  const { uuid } = Route.useParams()
  const router = useRouter()
  const search = useSearch({ from: '/admin/events/$uuid/' })
  const { data: event } = useEventOrNull(uuid)

  const isEditMode = !!event

  const defaultValues = event ? toFormValues(event) : toFormValuesFromQuery(search, uuid)

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
        <h1 className='text-2xl font-bold text-gray-900'>
          {isEditMode ? ADMIN_LABELS.eventEdit : ADMIN_LABELS.eventNew}
        </h1>
        <p className='mt-2 text-sm text-gray-600 md:text-base'>
          {isEditMode ? ADMIN_LABELS.eventEditDesc : ADMIN_LABELS.eventNewDesc}
        </p>
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
