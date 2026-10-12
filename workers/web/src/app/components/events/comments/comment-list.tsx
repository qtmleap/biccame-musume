import type { CommentResponse } from '@biccame/shared/schemas/comment.dto'
import { CommentItem } from '@/components/events/comments/comment-item'

type CommentListProps = {
  eventUuid: string
  comments: CommentResponse[]
}

export const CommentList = ({ eventUuid, comments }: CommentListProps) => {
  if (comments.length === 0) {
    return <p className='text-sm text-muted-foreground'>まだコメントはありません</p>
  }

  return (
    <div className='divide-y divide-border'>
      {comments.map((comment) => (
        <CommentItem key={comment.id} eventUuid={eventUuid} comment={comment} />
      ))}
    </div>
  )
}
