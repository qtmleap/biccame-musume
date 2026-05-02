import dayjs from 'dayjs'
import type { CommentResponse } from '@/schemas/comment.dto'

type CommentItemProps = {
  comment: CommentResponse
}

export const CommentItem = ({ comment }: CommentItemProps) => {
  return (
    <div className='border border-border rounded-lg px-4 py-3 space-y-1'>
      <div className='flex items-center justify-between gap-2'>
        <span className='text-sm font-semibold text-foreground'>{comment.nickname}</span>
        <span className='text-xs text-muted-foreground shrink-0'>{dayjs(comment.createdAt).fromNow()}</span>
      </div>
      <p className='text-sm text-foreground whitespace-pre-wrap break-words'>{comment.body}</p>
    </div>
  )
}
