import { useQuery } from '@tanstack/react-query'
import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { client } from '@/utils/client'
import { CommentItem } from './comment-item'

type CommentListProps = {
  eventUuid: string
}

export const CommentList = ({ eventUuid }: CommentListProps) => {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['events', eventUuid, 'comments'],
    queryFn: () => client.getEventComments({ params: { uuid: eventUuid } }),
    staleTime: 0,
    refetchOnMount: true
  })

  if (isLoading) {
    return (
      <div className='space-y-3'>
        <Skeleton className='h-16 w-full rounded-lg' />
        <Skeleton className='h-16 w-full rounded-lg' />
        <Skeleton className='h-16 w-full rounded-lg' />
      </div>
    )
  }

  if (isError) {
    return (
      <Alert variant='destructive'>
        <AlertCircle className='h-4 w-4' />
        <AlertDescription className='flex items-center justify-between gap-4'>
          <span>コメントの取得に失敗しました</span>
          <Button variant='outline' size='sm' onClick={() => refetch()}>
            再試行
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  if (!data || data.length === 0) {
    return <p className='text-sm text-muted-foreground'>まだコメントはありません</p>
  }

  return (
    <div className='divide-y divide-border'>
      {data.map((comment) => (
        <CommentItem key={comment.id} eventUuid={eventUuid} comment={comment} />
      ))}
    </div>
  )
}
