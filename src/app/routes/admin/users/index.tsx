import { createFileRoute, Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { ArrowLeft, Calendar } from 'lucide-react'
import { motion } from 'motion/react'
import { Suspense } from 'react'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useAdminUsers } from '@/hooks/use-admin-users'
import { useMediaQuery } from '@/hooks/use-media-query'
import { getStickerRotation, STICKER_HOVER_TRANSITION, STICKER_SHADOW_SM } from '@/lib/sticker'
import { cn } from '@/lib/utils'

type AdminUser = {
  id: string
  displayName: string | null
  email: string | null
  thumbnailURL: string | null
  createdAt: string
}

const UserCard = ({ user, index }: { user: AdminUser; index: number }) => {
  const isMultiColumn = useMediaQuery('(min-width: 640px)')
  const rotationDeg = isMultiColumn ? getStickerRotation(index) : 0

  return (
    <motion.div className='h-full' style={{ filter: STICKER_SHADOW_SM }}>
      <motion.div
        className='h-full'
        style={{ rotate: rotationDeg }}
        whileHover={{ scale: 1.04, rotate: 0 }}
        whileTap={{ scale: 0.97 }}
        transition={STICKER_HOVER_TRANSITION}
      >
        <div
          className={cn(
            'relative block rounded-xl p-4 border border-zinc-200 dark:border-card-border h-full bg-card flex flex-col'
          )}
        >
          <div className='mb-2 flex items-start gap-3'>
            <Avatar className='size-10 shrink-0'>
              <AvatarImage src={user.thumbnailURL ?? undefined} alt={user.displayName ?? 'user'} />
              <AvatarFallback className='text-sm bg-brand/10 text-brand'>
                {user.displayName?.charAt(0) ?? 'U'}
              </AvatarFallback>
            </Avatar>
            <div className='flex-1 min-w-0'>
              <h3 className='text-base font-semibold text-foreground line-clamp-1'>{user.displayName ?? '(未設定)'}</h3>
              <div className='mt-0.5 text-xs text-muted-foreground truncate'>{user.email ?? '(メール未登録)'}</div>
            </div>
          </div>
          <div className='mt-auto pt-2 flex items-center gap-1 text-xs text-muted-foreground font-numeric tabular-nums'>
            <Calendar className='size-3' />
            <span>{dayjs(user.createdAt).format('YYYY/MM/DD')} 登録</span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

const UsersContent = () => {
  const { data } = useAdminUsers()
  const users = data.users

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

        <div className='mb-4 md:mb-6'>
          <div className='flex items-center justify-between gap-4'>
            <h1 className='text-2xl font-bold text-foreground'>ユーザー管理</h1>
            <span className='text-sm text-muted-foreground tabular-nums'>{users.length} 人</span>
          </div>
          <p className='mt-2 text-sm text-muted-foreground md:text-base'>登録ユーザーの一覧確認。</p>
        </div>

        {users.length === 0 ? (
          <div className='rounded-lg border p-6 text-center'>
            <p className='text-sm text-muted-foreground'>登録ユーザーがいません</p>
          </div>
        ) : (
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
            {users.map((user, index) => (
              <UserCard key={user.id} user={user} index={index} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const UsersPage = () => (
  <Suspense fallback={<LoadingFallback />}>
    <UsersContent />
  </Suspense>
)

export const Route = createFileRoute('/admin/users/')({
  component: UsersPage
})
