import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft, Award, ChevronRight, Heart, LogIn, MapPin } from 'lucide-react'
import { motion } from 'motion/react'
import { Suspense, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getLargeTwitterPhoto, useAuth } from '@/hooks/useAuth'
import { useEvents } from '@/hooks/useEvents'
import { useUserActivity } from '@/hooks/useUserActivity'
import { EVENT_CATEGORY_LABELS } from '@/locales/app.content'
import { CATEGORY_STYLE } from '@/locales/component'
import type { Event } from '@/schemas/event.dto'

/**
 * イベントリストアイテム
 */
const EventListItem = ({ event }: { event: Event }) => {
  const categoryStyle = CATEGORY_STYLE[event.category]
  return (
    <Link
      to='/events/$uuid'
      params={{ uuid: event.uuid }}
      className='flex items-center justify-between py-2 transition-colors group'
    >
      <div className='flex-1 min-w-0'>
        <p className='text-sm font-medium text-gray-900 truncate group-hover:text-pink-600'>{event.title}</p>
        <Badge className={`${categoryStyle} border text-xs mt-1`}>{EVENT_CATEGORY_LABELS[event.category]}</Badge>
      </div>
      <ChevronRight className='h-4 w-4 text-gray-400 group-hover:text-gray-600 shrink-0' />
    </Link>
  )
}

/**
 * イベントセクション
 */
const EventSection = ({
  title,
  icon,
  events,
  emptyMessage,
  isLoading,
  showAllPath
}: {
  title: string
  icon: React.ReactNode
  events: Event[]
  emptyMessage: string
  isLoading: boolean
  showAllPath?: string
}) => {
  const displayEvents = events.slice(0, 10)
  const hasMore = events.length > 10

  return (
    <div className='space-y-2'>
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          {icon}
          <h2 className='text-xl font-bold text-gray-900'>{title}</h2>
          {events.length > 0 && <span className='text-sm text-gray-500'>({events.length})</span>}
        </div>
      </div>
      {isLoading ? (
        <p className='text-sm text-gray-500 py-2'>読み込み中...</p>
      ) : events.length > 0 ? (
        <div className='divide-y divide-gray-100'>
          {displayEvents.map((event) => (
            <EventListItem key={event.uuid} event={event} />
          ))}
          {hasMore && showAllPath && (
            <Link
              to={showAllPath}
              className='flex items-center justify-center py-2.5 text-sm text-pink-600 hover:text-pink-700 transition-colors'
            >
              すべて見る
            </Link>
          )}
        </div>
      ) : (
        <p className='text-sm text-gray-500 py-2'>{emptyMessage}</p>
      )}
    </div>
  )
}

/**
 * マイページコンテンツ
 */
const MyPageContent = () => {
  const { user, twitterProfile, isAuthenticated, loading, loggingOut, logout, loginWithTwitter } = useAuth()
  const router = useRouter()
  const { visitedStores, interestedEvents, completedEvents, isLoading } = useUserActivity(user?.uid)
  const { data: allEvents } = useEvents()
  const autoLoginAttempted = useRef(false)

  // イベントIDからイベント詳細を取得
  const interestedEventDetails = allEvents.filter((e) => interestedEvents.includes(e.uuid))
  const completedEventDetails = allEvents.filter((e) => completedEvents.includes(e.uuid))

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
            className='mb-6'
          >
            <EventSection
              title='気になるイベント'
              icon={<Heart className='h-5 w-5 text-pink-500' />}
              events={interestedEventDetails}
              emptyMessage='まだ気になるイベントがありません'
              isLoading={isLoading}
            />
          </motion.div>

          {/* 達成したイベント */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className='mb-6'
          >
            <EventSection
              title='達成したイベント'
              icon={<Award className='h-5 w-5 text-amber-500' />}
              events={completedEventDetails}
              emptyMessage='まだ達成したイベントがありません'
              isLoading={isLoading}
            />
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
