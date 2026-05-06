import { createFileRoute, Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { ArrowLeft } from 'lucide-react'
import { Suspense } from 'react'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useAdminUsers } from '@/hooks/use-admin-users'

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
          <p className='text-sm text-muted-foreground py-8 text-center'>登録ユーザーがいません</p>
        ) : (
          <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3'>
            {users.map((user) => (
              <div
                key={user.id}
                className='bg-card border border-card-border rounded-2xl p-4 flex items-center gap-3'
              >
                <Avatar className='size-12 shrink-0'>
                  <AvatarImage src={user.thumbnailURL ?? undefined} alt={user.displayName ?? 'user'} />
                  <AvatarFallback className='text-base bg-brand/10 text-brand'>
                    {user.displayName?.charAt(0) ?? 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className='flex-1 min-w-0'>
                  <div className='font-bold text-sm text-foreground truncate'>{user.displayName ?? '(未設定)'}</div>
                  <div className='text-xs text-muted-foreground truncate'>{user.email ?? '(メール未登録)'}</div>
                  <div className='mt-1 text-[11px] font-numeric tabular-nums text-muted-foreground'>
                    {dayjs(user.createdAt).format('YYYY/MM/DD')} 登録
                  </div>
                </div>
              </div>
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
