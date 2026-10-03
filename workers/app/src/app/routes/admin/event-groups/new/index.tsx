import { createFileRoute, useNavigate, useRouter, useSearch } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Suspense, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { EventGroupForm, toCopyGroupFormValues } from '@/components/admin/event-group-form'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Button } from '@/components/ui/button'
import { useAdminEventGroupOrNull } from '@/hooks/use-event-groups'

const NewEventGroupSearchSchema = z.object({
  from: z.uuid().optional()
})

const NewEventGroupContent = () => {
  const router = useRouter()
  const navigate = useNavigate()
  const search = useSearch({ from: '/admin/event-groups/new/' })
  const [newUuid] = useState(() => uuidv4())
  const { data: copySource } = useAdminEventGroupOrNull(search.from ?? '')

  const isCopyMode = search.from !== undefined && copySource !== null
  const defaultValues = isCopyMode && copySource ? toCopyGroupFormValues(copySource, newUuid) : undefined

  const handleSuccess = ({ uuid }: { uuid: string }) => {
    navigate({ to: '/admin/event-groups/$uuid/edit', params: { uuid }, replace: true })
  }

  const headerTitle = isCopyMode ? 'イベントグループのコピー作成' : 'イベントグループの新規作成'
  const headerDesc = isCopyMode
    ? '元のグループの内容をコピーして新しいグループを作成します。'
    : '関連イベントをまとめるグループを作成します。'

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
        <EventGroupForm defaultValues={defaultValues} onSuccess={handleSuccess} isEditMode={false} />
      </div>
    </div>
  )
}

const NewEventGroupPage = () => (
  <Suspense fallback={<LoadingFallback />}>
    <NewEventGroupContent />
  </Suspense>
)

export const Route = createFileRoute('/admin/event-groups/new/')({
  component: NewEventGroupPage,
  validateSearch: NewEventGroupSearchSchema
})
