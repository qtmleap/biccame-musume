import { createFileRoute, useRouter } from '@tanstack/react-router'
import { ArrowLeft, LogIn, LogOut } from 'lucide-react'
import { motion } from 'motion/react'
import { Suspense } from 'react'
import { toast } from 'sonner'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { getLargeTwitterPhoto, useAuth } from '@/hooks/useAuth'

/**
 * マイページコンテンツ
 */
const MyPageContent = () => {
  const { user, twitterProfile, isAuthenticated, logout, loginWithTwitter } = useAuth()
  const router = useRouter()

  /**
   * ログアウト処理
   */
  const handleLogout = async () => {
    try {
      await logout()
      toast.success('ログアウトしました')
    } catch {
      toast.error('ログアウトに失敗しました')
    }
  }

  /**
   * ログイン処理
   */
  const handleLogin = async () => {
    try {
      await loginWithTwitter()
      toast.success('ログインしました')
    } catch {
      toast.error('ログインに失敗しました')
    }
  }

  // 未ログイン
  if (!isAuthenticated) {
    return (
      <div className='min-h-screen bg-pink-50'>
        <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-6xl'>
          <div className='max-w-2xl'>
            {/* 戻るボタン */}
            <div className='pb-2'>
              <Button
                variant='ghost'
                size='sm'
                className='text-gray-600 hover:text-gray-900 -ml-2'
                onClick={() => router.history.back()}
              >
                <ArrowLeft className='h-4 w-4 mr-1' />
                戻る
              </Button>
            </div>

            <h1 className='text-2xl font-bold text-gray-900 mb-6'>マイページ</h1>
            <p className='text-sm text-gray-600 mb-4'>マイページを利用するにはログインしてください</p>
            <Button onClick={handleLogin} className='gap-2'>
              <LogIn className='w-4 h-4' />
              Twitterでログイン
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className='min-h-screen bg-pink-50'>
      <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-6xl'>
        <div className='max-w-2xl'>
          {/* 戻るボタン */}
          <div className='pb-2'>
            <Button
              variant='ghost'
              size='sm'
              className='text-gray-600 hover:text-gray-900 -ml-2'
              onClick={() => router.history.back()}
            >
              <ArrowLeft className='h-4 w-4 mr-1' />
              戻る
            </Button>
          </div>

          {/* プロフィールセクション */}
          <div className='mb-4 flex items-end justify-between gap-4'>
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <Avatar className='h-21.25 w-21.25 border-2 border-gray-800'>
                <AvatarImage
                  src={getLargeTwitterPhoto(user?.photoURL)}
                  alt={user?.displayName ?? 'User'}
                  className='object-cover'
                />
                <AvatarFallback className='text-4xl bg-pink-100 text-pink-700'>
                  {user?.displayName?.charAt(0) ?? 'U'}
                </AvatarFallback>
              </Avatar>
            </motion.div>
          </div>

          {/* 名前 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className='mb-6'
          >
            <h1 className='text-2xl font-bold text-gray-900'>{user?.displayName}</h1>
            {twitterProfile?.screenName && (
              <a
                href={`https://twitter.com/${twitterProfile.screenName}`}
                target='_blank'
                rel='noopener noreferrer'
                className='text-sky-600 text-sm hover:text-sky-800'
              >
                @{twitterProfile.screenName}
              </a>
            )}
          </motion.div>

          {/* 今後の機能予告 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className='space-y-3 mb-6'
          >
            <h2 className='text-xl font-bold text-gray-900'>今後追加予定の機能</h2>
            <ul className='text-sm text-gray-600 space-y-2'>
              <li>訪れた店舗の記録</li>
              <li>興味のあるイベントの保存</li>
              <li>達成したイベントの管理</li>
            </ul>
          </motion.div>

          {/* ログアウト */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.6 }}>
            <Button variant='destructive' onClick={handleLogout} className='gap-2'>
              <LogOut className='w-4 h-4' />
              ログアウト
            </Button>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

/**
 * ルートコンポーネント
 */
const RouteComponent = () => (
  <Suspense fallback={<LoadingFallback />}>
    <MyPageContent />
  </Suspense>
)

export const Route = createFileRoute('/me/')({
  component: RouteComponent
})
