import { createFileRoute, notFound, useRouter } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Suspense } from 'react'
import { z } from 'zod'
import { EventGroupForm, toGroupFormValues } from '@/components/admin/event-group-form'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Button } from '@/components/ui/button'
import { useAdminEventGroup } from '@/hooks/use-event-groups'

const EditEventGroupContent = () => {
  const { uuid } = Route.useParams()
  const router = useRouter()
  const { data: group } = useAdminEventGroup(uuid)

  const defaultValues = toGroupFormValues(group)

  const handleSuccess = () => {
    router.navigate({ to: '/admin/event-groups' })
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
        <h1 className='text-2xl font-bold text-foreground'>イベントグループの編集</h1>
        <p className='mt-2 text-sm text-muted-foreground md:text-base'>
          公開ページは <span className='font-mono text-foreground'>/events/group/{group.uuid}</span>{' '}
          から確認できます。所属イベント: {group.events.length} 件。
        </p>
      </div>

      <div>
        <EventGroupForm defaultValues={defaultValues} onSuccess={handleSuccess} isEditMode={true} />
      </div>
    </div>
  )
}

const EditEventGroupPage = () => {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <EditEventGroupContent />
    </Suspense>
  )
}

export const Route = createFileRoute('/admin/event-groups/$uuid/edit/')({
  component: EditEventGroupPage,
  beforeLoad: ({ params }) => {
    const result = z.uuid().safeParse(params.uuid)
    if (!result.success) {
      throw notFound()
    }
  }
})
