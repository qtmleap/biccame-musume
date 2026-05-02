import dayjs from 'dayjs'
import { useMemo } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useCharacters } from '@/hooks/use-characters'
import type { CommentResponse } from '@/schemas/comment.dto'

type CommentItemProps = {
  comment: CommentResponse
}

export const CommentItem = ({ comment }: CommentItemProps) => {
  const { data: characters } = useCharacters()
  const character = useMemo(
    () => characters.find((c) => c.id === comment.characterId),
    [characters, comment.characterId]
  )
  const displayName = character?.character?.name ?? '匿名'

  return (
    <article className='flex gap-3 py-3'>
      <Avatar className='size-10 shrink-0 overflow-hidden'>
        <AvatarImage
          src={character?.character?.image_url}
          alt=''
          className='object-cover object-top scale-[1.8] mix-blend-multiply'
        />
        <AvatarFallback>{displayName[0] ?? '?'}</AvatarFallback>
      </Avatar>
      <div className='flex-1 min-w-0 space-y-0.5'>
        <div className='flex items-center gap-2 text-sm'>
          <span className='font-semibold text-foreground'>{displayName}</span>
          <span className='text-muted-foreground'>·</span>
          <time dateTime={comment.createdAt} className='text-xs text-muted-foreground'>
            {dayjs(comment.createdAt).fromNow()}
          </time>
        </div>
        <p className='text-sm text-foreground whitespace-pre-wrap break-words'>{comment.body}</p>
      </div>
    </article>
  )
}
