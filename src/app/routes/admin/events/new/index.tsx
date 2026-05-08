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
  const { data: copySource } = useEventOrNull(search.from ?? '')

  const isCopyMode = search.from !== undefined && copySource !== null

  const defaultValues =
    isCopyMode && copySource ? toCopyFormValues(copySource, newUuid) : toFormValuesFromQuery(search, newUuid)

  const handleSuccess = () => {
    router.navigate({ to: '/admin/events/$uuid/edit', params: { uuid: newUuid } })
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
        <EventForm defaultValues={defaultValues} onSuccess={handleSuccess} isEditMode={false} />
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
