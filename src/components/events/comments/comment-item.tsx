import dayjs from 'dayjs'
import { Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useCharacters } from '@/hooks/use-characters'
import { useCloudflareAccess } from '@/hooks/use-cloudflare-access'
import { useDeleteComment } from '@/hooks/use-delete-comment'
import type { CommentResponse } from '@/schemas/comment.dto'

type CommentItemProps = {
  eventUuid: string
  comment: CommentResponse
}

export const CommentItem = ({ eventUuid, comment }: CommentItemProps) => {
  const { data: characters } = useCharacters()
  const { isAuthenticated } = useCloudflareAccess()
  const mutation = useDeleteComment(eventUuid)
  const character = useMemo(
    () => characters.find((c) => c.id === comment.characterId),
    [characters, comment.characterId]
  )
  const displayName = character?.character?.name ?? '匿名'

  return (
    <article className='flex gap-3 py-3'>
      <Avatar className='size-12'>
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
          {comment.userId && (
            <span className='ml-1 rounded bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-700'>ログイン</span>
          )}
          <span className='text-muted-foreground'>·</span>
          <time dateTime={comment.createdAt} className='text-sm text-muted-foreground'>
            {dayjs(comment.createdAt).fromNow()}
          </time>
        </div>
        <p className='text-base text-foreground whitespace-pre-wrap break-words'>{comment.body}</p>
      </div>
      {isAuthenticated && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              aria-label='コメントを削除する'
              title='コメントを削除する'
              disabled={mutation.isPending}
              className='shrink-0 size-8 text-muted-foreground hover:text-brand border border-transparent'
            >
              <Trash2 className='size-4' />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent size='sm'>
            <AlertDialogHeader>
              <AlertDialogTitle>コメントを削除しますか？</AlertDialogTitle>
              <AlertDialogDescription>この操作は取り消せません。</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className='border-border-strong'>キャンセル</AlertDialogCancel>
              <AlertDialogAction variant='destructive' onClick={() => mutation.mutate(comment.id)}>
                削除する
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </article>
  )
}
