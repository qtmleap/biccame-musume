import { CommentForm } from './comment-form'
import { CommentList } from './comment-list'

type CommentSectionProps = {
  eventUuid: string
}

export const CommentSection = ({ eventUuid }: CommentSectionProps) => {
  return (
    <div className='space-y-6'>
      <h2 className='text-xl font-bold text-foreground'>コメント</h2>
      <CommentForm eventUuid={eventUuid} />
      <CommentList eventUuid={eventUuid} />
    </div>
  )
}
