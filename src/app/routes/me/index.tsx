import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft, Award, Heart, MapPin } from 'lucide-react'
import { motion } from 'motion/react'
import { Suspense } from 'react'
import { toast } from 'sonner'
import { ErrorBoundary } from '@/components/common/error-boundary'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { EventGridItem } from '@/components/events/event-grid-item'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { getLargeTwitterPhoto, useAuth } from '@/hooks/useAuth'
import { useEvents } from '@/hooks/useEvents'
import { useUserActivity } from '@/hooks/useUserActivity'
import { auth } from '@/lib/firebase'
import { MY_PAGE_LABELS } from '@/locales/app.content'
import type { Event } from '@/schemas/event.dto'

const EventSection = ({
  title,
  icon,
  events,
  emptyMessage,
  showAllPath
}: {
  title: string
  icon: React.ReactNode
  events: Event[]
  emptyMessage: string
  showAllPath?: string
}) => {
  const displayEvents = events.slice(0, 12)

  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          {icon}
          <h2 className='text-xl font-bold text-gray-900'>{title}</h2>
          {events.length > 0 && <span className='text-sm text-gray-500'>({events.length})</span>}
        </div>
        {showAllPath && events.length > 0 && (
          <Link
            to={showAllPath}
            className='text-xs text-pink-600 hover:text-pink-700 transition-colors hover:underline'
          >
            {MY_PAGE_LABELS.viewAll}
          </Link>
        )}
      </div>
      {events.length > 0 ? (
        <div className='grid grid-cols-1 md:grid-cols-3 gap-2'>
          {displayEvents.map((event, index) => (
            <EventGridItem key={event.uuid} event={event} index={index} />
          ))}
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
  const { user, logout } = useAuth()
  const router = useRouter()
  const { stores, interestedEvents, completedEvents } = useUserActivity()
  const { data: allEvents } = useEvents()

  // イベントIDからイベント詳細を取得
  const interestedEventDetails = allEvents.filter((e) => interestedEvents.includes(e.uuid))
  const completedEventDetails = allEvents.filter((e) => completedEvents.includes(e.uuid))

  /**
   * ログアウト処理
   */
  const handleLogout = async () => {
    try {
      await logout()
      toast.success(MY_PAGE_LABELS.logoutSuccess)
    } catch {
      toast.error(MY_PAGE_LABELS.logoutError)
    }
  }

  return (
    <div className='min-h-screen bg-pink-50'>
      <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-6xl'>
        <div>
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
                {MY_PAGE_LABELS.logout}
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
              <h2 className='text-xl font-bold text-gray-900'>{MY_PAGE_LABELS.visitedStores}</h2>
            </div>
            {stores.length > 0 ? (
              <p className='text-sm text-gray-600'>
                {stores.length}
                {MY_PAGE_LABELS.visitedStoresCount}
              </p>
            ) : (
              <p className='text-sm text-gray-500'>{MY_PAGE_LABELS.noVisitedStores}</p>
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
              title={MY_PAGE_LABELS.interestedEvents}
              icon={<Heart className='h-5 w-5 text-pink-500' />}
              events={interestedEventDetails}
              emptyMessage={MY_PAGE_LABELS.noInterestedEvents}
              showAllPath='/me/interested'
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
              title={MY_PAGE_LABELS.completedEvents}
              icon={<Award className='h-5 w-5 text-amber-500' />}
              events={completedEventDetails}
              emptyMessage={MY_PAGE_LABELS.noCompletedEvents}
              showAllPath='/me/completed'
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
  <ErrorBoundary>
    <Suspense fallback={<LoadingFallback />}>
      <MyPageContent />
    </Suspense>
  </ErrorBoundary>
)

export const Route = createFileRoute('/me/')({
  component: RouteComponent,
  beforeLoad: async () => {
    return new Promise((resolve) => {
      const unsubscribe = auth.onAuthStateChanged((user) => {
        unsubscribe()
        if (!user) {
          throw new Error('Unauthorized')
        }
        resolve(undefined)
      })
    })
  },
  onError: ({ error, navigate }) => {
    if (error.message === 'Unauthorized') {
      navigate({ to: '/' })
    }
  }
})
