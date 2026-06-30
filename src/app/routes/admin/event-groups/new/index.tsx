import { createFileRoute, useRouter } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { EventGroupForm } from '@/components/admin/event-group-form'
import { Button } from '@/components/ui/button'

const NewEventGroupPage = () => {
  const router = useRouter()

  const handleSuccess = ({ uuid }: { uuid: string }) => {
    router.navigate({ to: '/admin/event-groups/$uuid/edit', params: { uuid } })
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
        <h1 className='text-2xl font-bold text-foreground'>イベントグループの新規作成</h1>
        <p className='mt-2 text-sm text-muted-foreground md:text-base'>
          複数イベントを束ねるグループを作成します。作成後、Event 編集画面でこのグループを選択できます。
        </p>
      </div>

      <div>
        <EventGroupForm onSuccess={handleSuccess} isEditMode={false} />
      </div>
    </div>
  )
}

export const Route = createFileRoute('/admin/event-groups/new/')({
  component: NewEventGroupPage
})
