import { createFileRoute, Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { motion } from 'motion/react'
import { Suspense, useMemo, useState } from 'react'
import { LoadingFallback } from '@/components/common/loading-fallback'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from '@/components/ui/pagination'
import { useAllComments, useDeleteAdminComment } from '@/hooks/use-admin-comments'
import { useCharacters } from '@/hooks/use-characters'
import { DURATION } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { AdminComment } from '@/schemas/admin-comment.dto'

const PER_PAGE = 30

type StatCardProps = { label: string; value: number; accent?: string }

const StatCard = ({ label, value, accent = 'text-foreground' }: StatCardProps) => (
  <div className='bg-card border border-card-border rounded-xl px-4 py-3 flex-1 min-w-0 text-center'>
    <div
      className={cn('font-numeric font-black tabular-nums text-2xl md:text-3xl leading-none', accent)}
      style={{ letterSpacing: '-0.04em' }}
    >
      {value}
    </div>
    <div className='mt-1 text-[11px] text-muted-foreground'>{label}</div>
  </div>
)

const CommentRow = ({ comment }: { comment: AdminComment }) => {
  const { data: characters } = useCharacters()
  const deleteComment = useDeleteAdminComment()
  const character = useMemo(
    () => characters.find((c) => c.id === comment.characterId),
    [characters, comment.characterId]
  )
  const displayName = character?.character?.name ?? comment.characterId
  const isDeleted = comment.deletedAt !== null

  return (
    <article
      className={cn(
        'flex gap-3 rounded-xl border border-card-border bg-card p-3 transition-colors',
        isDeleted && 'opacity-60'
      )}
    >
      <Avatar className='size-10 shrink-0 border border-card-border'>
        <AvatarImage
          src={character?.character?.image_url}
          alt=''
          className='object-cover scale-[1.8] translate-y-[18%] mix-blend-multiply'
        />
        <AvatarFallback>{displayName[0] ?? '?'}</AvatarFallback>
      </Avatar>

      <div className='flex-1 min-w-0 space-y-1'>
        <div className='flex items-center gap-2 flex-wrap text-xs'>
          <span className='font-bold text-foreground truncate'>{displayName}</span>
          {comment.userId && (
            <span className='rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700'>ログイン</span>
          )}
          {isDeleted && (
            <span className='rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive'>
              削除済み
            </span>
          )}
          <span className='text-muted-foreground'>·</span>
          <time dateTime={comment.createdAt} className='text-muted-foreground tabular-nums'>
            {dayjs(comment.createdAt).format('YYYY/MM/DD HH:mm')}
          </time>
        </div>

        <p className='text-sm text-foreground whitespace-pre-wrap break-words'>{comment.body}</p>

        <div className='flex items-center gap-2 text-[11px] text-muted-foreground'>
          <Link
            to='/admin/events/$uuid'
            params={{ uuid: comment.eventId }}
            className='hover:text-brand truncate underline-offset-2 hover:underline'
          >
            {comment.eventTitle}
          </Link>
          <span>·</span>
          <span className='font-numeric tabular-nums'>{comment.ipAddress}</span>
        </div>
      </div>

      {!isDeleted && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              aria-label='コメントを削除する'
              disabled={deleteComment.isPending}
              className='shrink-0 size-8 text-muted-foreground hover:text-destructive'
            >
              <Trash2 className='size-4' />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent size='sm'>
            <AlertDialogHeader>
              <AlertDialogTitle>コメントを削除しますか？</AlertDialogTitle>
              <AlertDialogDescription>論理削除されます。本文は閲覧できなくなります。</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>キャンセル</AlertDialogCancel>
              <AlertDialogAction
                variant='destructive'
                onClick={() => deleteComment.mutate({ eventId: comment.eventId, commentId: comment.id })}
              >
                削除する
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </article>
  )
}

const CommentsContent = () => {
  const [includeDeleted, setIncludeDeleted] = useState(false)
  const [page, setPage] = useState(1)
  const { data } = useAllComments(includeDeleted)
  const comments = data.comments

  const totalCount = comments.length
  const deletedCount = comments.filter((c) => c.deletedAt !== null).length
  const activeCount = totalCount - deletedCount
  const loginCount = comments.filter((c) => c.userId).length

  const totalPages = Math.max(1, Math.ceil(totalCount / PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * PER_PAGE
  const pagedComments = comments.slice(start, start + PER_PAGE)
  const showingFrom = totalCount === 0 ? 0 : start + 1
  const showingTo = Math.min(start + PER_PAGE, totalCount)

  const handleIncludeDeletedChange = (v: boolean) => {
    setIncludeDeleted(v)
    setPage(1)
  }

  return (
    <div className='min-h-screen bg-page-bg'>
      <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-6xl'>
        <div className='pb-2'>
          <Button
            variant='ghost'
            size='sm'
            className='text-muted-foreground hover:text-foreground -ml-2 border border-transparent'
            asChild
          >
            <Link to='/admin'>
              <ArrowLeft className='h-4 w-4 mr-1' />
              管理画面に戻る
            </Link>
          </Button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.normal }}
          className='mb-4 md:mb-6'
        >
          <h1 className='font-display font-bold text-2xl md:text-3xl text-foreground'>コメント管理</h1>
          <p className='mt-1 text-sm text-muted-foreground'>イベントに投稿されたコメントの確認と削除。</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.normal, delay: 0.06 }}
          className='flex gap-2 md:gap-3 mb-4'
        >
          <StatCard label='総コメント' value={totalCount} accent='text-foreground' />
          <StatCard label='公開中' value={activeCount} accent='text-brand' />
          <StatCard label='削除済み' value={deletedCount} accent='text-muted-foreground' />
          <StatCard label='ログイン投稿' value={loginCount} accent='text-favorite' />
        </motion.div>

        <div className='flex items-center justify-between gap-3 mb-4'>
          <Label htmlFor='include-deleted' className='flex items-center gap-1.5 cursor-pointer font-normal'>
            <Checkbox
              id='include-deleted'
              checked={includeDeleted}
              onCheckedChange={(v) => handleIncludeDeletedChange(v === true)}
              className='size-4'
            />
            <span className='text-xs text-muted-foreground select-none'>削除済みも表示</span>
          </Label>
          {totalCount > 0 && (
            <p className='text-xs text-muted-foreground tabular-nums'>
              {showingFrom}–{showingTo} / {totalCount} 件
            </p>
          )}
        </div>

        <div className='space-y-2'>
          {pagedComments.map((comment) => (
            <CommentRow key={comment.id} comment={comment} />
          ))}
          {totalCount === 0 && (
            <div className='text-center py-12 text-muted-foreground text-sm'>コメントはまだありません</div>
          )}
        </div>

        <div className='mt-6'>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  size='default'
                  href='#'
                  onClick={(e) => {
                    e.preventDefault()
                    if (safePage > 1) setPage(safePage - 1)
                  }}
                  className={safePage === 1 ? 'pointer-events-none opacity-50' : ''}
                />
              </PaginationItem>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                if (p === 1 || p === totalPages || (p >= safePage - 1 && p <= safePage + 1)) {
                  return (
                    <PaginationItem key={p}>
                      <PaginationLink
                        size='icon'
                        href='#'
                        onClick={(e) => {
                          e.preventDefault()
                          setPage(p)
                        }}
                        isActive={safePage === p}
                      >
                        {p}
                      </PaginationLink>
                    </PaginationItem>
                  )
                }
                if (p === safePage - 2 || p === safePage + 2) {
                  return (
                    <PaginationItem key={p}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  )
                }
                return null
              })}

              <PaginationItem>
                <PaginationNext
                  size='default'
                  href='#'
                  onClick={(e) => {
                    e.preventDefault()
                    if (safePage < totalPages) setPage(safePage + 1)
                  }}
                  className={safePage === totalPages ? 'pointer-events-none opacity-50' : ''}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </div>
    </div>
  )
}

const CommentsPage = () => {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <CommentsContent />
    </Suspense>
  )
}

export const Route = createFileRoute('/admin/comments/')({
  component: CommentsPage
})
