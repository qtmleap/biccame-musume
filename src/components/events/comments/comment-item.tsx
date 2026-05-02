import dayjs from 'dayjs'
import { Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useCharacters } from '@/hooks/use-characters'
import { useCloudflareAccess } from '@/hooks/use-cloudflare-access'
import type { CommentResponse } from '@/schemas/comment.dto'

type CommentItemProps = {
  comment: CommentResponse
}

export const CommentItem = ({ comment }: CommentItemProps) => {
  const { data: characters } = useCharacters()
  const { isAuthenticated } = useCloudflareAccess()
  const character = useMemo(
    () => characters.find((c) => c.id === comment.characterId),
    [characters, comment.characterId]
  )
  const displayName = character?.character?.name ?? '匿名'

  return (
    <article className='flex gap-3 py-3'>
      <Avatar className='size-12 shrink-0 overflow-hidden border-2 border-[#e50012]'>
        <AvatarImage
          src={character?.character?.image_url}
          alt=''
          className='object-cover scale-[1.8] translate-y-[18%] mix-blend-multiply'
        />
        <AvatarFallback>{displayName[0] ?? '?'}</AvatarFallback>
      </Avatar>
      <div className='flex-1 min-w-0 space-y-1'>
        <div className='flex items-center gap-2'>
          <span className='font-semibold text-foreground'>{displayName}</span>
          <span className='text-muted-foreground'>·</span>
          <time dateTime={comment.createdAt} className='text-sm text-muted-foreground'>
            {dayjs(comment.createdAt).fromNow()}
          </time>
        </div>
        <p className='text-base text-foreground whitespace-pre-wrap break-words'>{comment.body}</p>
      </div>
      {isAuthenticated && (
        <Button
          type='button'
          variant='ghost'
          size='icon'
          aria-label='コメントを削除する（管理者）'
          title='管理者：コメントを削除（未実装）'
          disabled
          className='shrink-0 size-8 text-muted-foreground hover:text-[#e50012]'
        >
          <Trash2 className='size-4' />
        </Button>
      )}
    </article>
  )
}
