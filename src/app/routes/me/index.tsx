import { createFileRoute, useRouter } from '@tanstack/react-router'
import { ArrowLeft, LogIn, MapPin, Star, Trophy } from 'lucide-react'
import { motion } from 'motion/react'
import { Suspense, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { getLargeTwitterPhoto, useAuth } from '@/hooks/useAuth'
import { useUserActivity } from '@/hooks/useUserActivity'

/**
 * マイページコンテンツ
 */
const MyPageContent = () => {
  const { user, twitterProfile, isAuthenticated, loading, loggingOut, logout, loginWithTwitter } = useAuth()
  const router = useRouter()
  const { visitedStores, interestedEvents, completedEvents, isLoading } = useUserActivity(user?.uid)
  const autoLoginAttempted = useRef(false)

  /**
   * 非ログイン時に自動でログインを試みる
   */
  useEffect(() => {
    if (!loading && !isAuthenticated && !autoLoginAttempted.current) {
      autoLoginAttempted.current = true
      loginWithTwitter()
        .then(() => {
          toast.success('ログインしました')
        })
        .catch(() => {
          // ユーザーがキャンセルした場合など、エラーは無視
        })
    }
  }, [loading, isAuthenticated, loginWithTwitter])

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

  // ログアウト中はローディング表示
  if (loggingOut) {
    return <LoadingFallback />
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

            {/* アクションボタン */}
            <div className='flex gap-2'>
              <Button
                variant='outline'
                size='sm'
                onClick={handleLogout}
                className='rounded-full px-4 h-7 text-xs font-semibold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
              >
                ログアウト
              </Button>
            </div>
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

          {/* 訪れた店舗の記録 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className='space-y-3 mb-6'
          >
            <div className='flex items-center gap-2'>
              <MapPin className='h-5 w-5 text-pink-600' />
              <h2 className='text-xl font-bold text-gray-900'>訪れた店舗の記録</h2>
            </div>
            {isLoading ? (
              <p className='text-sm text-gray-500'>読み込み中...</p>
            ) : visitedStores.length > 0 ? (
              <p className='text-sm text-gray-600'>{visitedStores.length}店舗を訪問済み</p>
            ) : (
              <p className='text-sm text-gray-500'>まだ訪問した店舗がありません</p>
            )}
          </motion.div>

          {/* 興味のあるイベント */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className='space-y-3 mb-6'
          >
            <div className='flex items-center gap-2'>
              <Star className='h-5 w-5 text-yellow-500' />
              <h2 className='text-xl font-bold text-gray-900'>興味のあるイベント</h2>
            </div>
            {isLoading ? (
              <p className='text-sm text-gray-500'>読み込み中...</p>
            ) : interestedEvents.length > 0 ? (
              <p className='text-sm text-gray-600'>{interestedEvents.length}件のイベントに興味あり</p>
            ) : (
              <p className='text-sm text-gray-500'>まだ興味のあるイベントがありません</p>
            )}
          </motion.div>

          {/* 達成したイベント */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className='space-y-3 mb-6'
          >
            <div className='flex items-center gap-2'>
              <Trophy className='h-5 w-5 text-amber-500' />
              <h2 className='text-xl font-bold text-gray-900'>達成したイベント</h2>
            </div>
            {isLoading ? (
              <p className='text-sm text-gray-500'>読み込み中...</p>
            ) : completedEvents.length > 0 ? (
              <p className='text-sm text-gray-600'>{completedEvents.length}件のイベントを達成</p>
            ) : (
              <p className='text-sm text-gray-500'>まだ達成したイベントがありません</p>
            )}
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
