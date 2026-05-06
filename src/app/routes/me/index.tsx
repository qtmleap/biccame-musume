import { createFileRoute, Link } from '@tanstack/react-router'
import { Award, Heart, MapPin } from 'lucide-react'
import { motion } from 'motion/react'
import { Suspense } from 'react'
import { toast } from 'sonner'
import { ErrorBoundary } from '@/components/common/error-boundary'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { PaginatedEventGrid } from '@/components/events/paginated-event-grid'
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
import { getLargeTwitterPhoto, useAuth } from '@/hooks/use-auth'
import { useEvents } from '@/hooks/use-events'
import { useUserActivity } from '@/hooks/use-user-activity'
import { auth } from '@/lib/firebase'
import { DURATION } from '@/lib/motion'
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
      <div className='flex items-center gap-2'>
        {icon}
        <h2 className='text-xl font-bold text-foreground'>{title}</h2>
        {events.length > 0 && <span className='text-sm text-muted-foreground'>({events.length})</span>}
      </div>
      <PaginatedEventGrid
        events={displayEvents}
        page={1}
        onPageChange={() => {}}
        compact
        emptyState={<p className='text-sm text-muted-foreground py-2'>{emptyMessage}</p>}
      />
      {showAllPath && events.length > 0 && (
        <div className='mt-4 text-right'>
          <Link
            to={showAllPath}
            className='text-sm text-muted-foreground hover:text-foreground font-semibold hover:underline transition-colors'
          >
            {MY_PAGE_LABELS.viewAll}
          </Link>
        </div>
      )}
    </div>
  )
}

/**
 * マイページコンテンツ
 */
const MyPageContent = () => {
  const { user, logout } = useAuth()
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
    <div className='min-h-screen bg-page-bg'>
      <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-6xl'>
        <div>
          {/* タイトル */}
          <h1 className='text-2xl font-bold text-foreground mb-4'>マイページ</h1>

          {/* プロフィールセクション */}
          <div className='mb-4 flex items-end justify-between gap-4'>
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: DURATION.normal }}
            >
              <Avatar className='h-21.25 w-21.25'>
                <AvatarImage
                  src={getLargeTwitterPhoto(user?.photoURL)}
                  alt={user?.displayName ?? 'User'}
                  className='object-cover'
                />
                <AvatarFallback className='text-4xl bg-brand/10 text-brand'>
                  {user?.displayName?.charAt(0) ?? 'U'}
                </AvatarFallback>
              </Avatar>
            </motion.div>

            {/* アクションボタン */}
            <div className='flex gap-2'>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant='outline'
                    size='sm'
                    className='rounded-full px-4 h-9 text-xs font-semibold bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20'
                  >
                    {MY_PAGE_LABELS.logout}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className='rounded-3xl shadow-2xl border-transparent'>
                  <AlertDialogHeader>
                    <AlertDialogTitle>ログアウトしますか？</AlertDialogTitle>
                    <AlertDialogDescription>
                      ログアウトするとマイページにアクセスできなくなります。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>キャンセル</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleLogout}
                      variant='outline'
                      className='border-brand/50 text-brand hover:bg-brand/10 hover:text-brand hover:border-brand/50'
                    >
                      ログアウトする
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          {/* 名前 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.normal, delay: 0.2 }}
            className='mb-6'
          >
            <h2 className='text-2xl font-bold text-foreground'>{user?.displayName}</h2>
          </motion.div>

          {/* 訪れた店舗の記録 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: DURATION.normal, delay: 0.4 }}
            className='space-y-3 mb-6'
          >
            <div className='flex items-center gap-2'>
              <MapPin className='h-5 w-5 text-brand' />
              <h2 className='text-xl font-bold text-foreground'>{MY_PAGE_LABELS.visitedStores}</h2>
            </div>
            {stores.length > 0 ? (
              <p className='text-sm text-muted-foreground'>
                {stores.length}
                {MY_PAGE_LABELS.visitedStoresCount}
              </p>
            ) : (
              <p className='text-sm text-muted-foreground'>{MY_PAGE_LABELS.noVisitedStores}</p>
            )}
          </motion.div>

          {/* 推しのビッカメ娘 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: DURATION.normal, delay: 0.45 }}
            className='space-y-3 mb-6'
          >
            <Link
              to='/me/favorites'
              className='inline-flex items-center gap-2 text-foreground hover:text-brand transition-colors'
            >
              <Heart className='h-5 w-5 text-favorite fill-current' />
              <h2 className='text-xl font-bold'>推しのビッカメ娘</h2>
            </Link>
            <p className='text-sm text-muted-foreground'>推しを登録して、まとめて応援できるよ</p>
          </motion.div>

          {/* 興味のあるイベント */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: DURATION.normal, delay: 0.5 }}
            className='mb-6'
          >
            <EventSection
              title={MY_PAGE_LABELS.interestedEvents}
              icon={<Heart className='h-5 w-5 text-action-interest' />}
              events={interestedEventDetails}
              emptyMessage={MY_PAGE_LABELS.noInterestedEvents}
              showAllPath='/me/interested'
            />
          </motion.div>

          {/* 達成したイベント */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: DURATION.normal, delay: 0.6 }}
            className='mb-6'
          >
            <EventSection
              title={MY_PAGE_LABELS.completedEvents}
              icon={<Award className='h-5 w-5 text-action-award' />}
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
