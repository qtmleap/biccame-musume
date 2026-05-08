import type { CommentResponse } from '@/schemas/comment.dto'
import { CommentFormDialog } from './comment-form-dialog'
import { CommentList } from './comment-list'

type CommentSectionProps = {
  eventUuid: string
  comments: CommentResponse[]
}

export const CommentSection = ({ eventUuid, comments }: CommentSectionProps) => {
  return (
    <div className='space-y-6'>
      <h2 className='text-xl font-bold text-foreground'>コメント</h2>
      <CommentList eventUuid={eventUuid} comments={comments} />
      <CommentFormDialog eventUuid={eventUuid} />
    </div>
  )
}
