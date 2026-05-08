import { createFileRoute, notFound, useRouter } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Suspense } from 'react'
import { z } from 'zod'
import { EventForm } from '@/components/admin/event-form'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Button } from '@/components/ui/button'
import { useEvent } from '@/hooks/use-events'
import { toFormValues } from '@/lib/event-form'
import { ADMIN_LABELS } from '@/locales/app.content'

const EditEventContent = () => {
  const { uuid } = Route.useParams()
  const router = useRouter()
  const { data: event } = useEvent(uuid)

  const defaultValues = toFormValues(event)

  const handleSuccess = () => {
    router.navigate({ to: '/admin/events' })
  }

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
        <h1 className='text-2xl font-bold text-foreground'>{ADMIN_LABELS.eventEdit}</h1>
        <p className='mt-2 text-sm text-muted-foreground md:text-base'>{ADMIN_LABELS.eventEditDesc}</p>
      </div>

      <div>
        <EventForm defaultValues={defaultValues} onSuccess={handleSuccess} isEditMode={true} />
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

export const Route = createFileRoute('/admin/events/$uuid/edit/')({
  component: EditEventPage,
  beforeLoad: ({ params }) => {
    const result = z.uuid().safeParse(params.uuid)
    if (!result.success) {
      throw notFound()
    }
  }
})
