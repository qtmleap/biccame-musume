import { createFileRoute, Link } from '@tanstack/react-router'
import { Award, Heart, MapPin } from 'lucide-react'
import { motion } from 'motion/react'
import { Suspense } from 'react'
import { toast } from 'sonner'
import { CharacterListCard } from '@/components/character-list-card'
import { ErrorBoundary } from '@/components/common/error-boundary'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { EventGridItem } from '@/components/events/event-grid-item'
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
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { useCharacters } from '@/hooks/use-characters'
import { useEvents } from '@/hooks/use-events'
import { useFavorites } from '@/hooks/use-favorites'
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
      {events.length === 0 ? (
        <p className='text-sm text-muted-foreground py-2'>{emptyMessage}</p>
      ) : (
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
          {displayEvents.map((event, index) => (
            <EventGridItem key={event.uuid} event={event} index={index} compact />
          ))}
        </div>
      )}
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
  const { logout } = useAuth()
  const { stores, interestedEvents, completedEvents } = useUserActivity()
  const { data: allEvents } = useEvents()
  const { data: characters } = useCharacters()
  const { favorites } = useFavorites()

  const interestedEventDetails = allEvents.filter((e) => interestedEvents.includes(e.uuid))
  const completedEventDetails = allEvents.filter((e) => completedEvents.includes(e.uuid))
  const favoriteCharacters = characters.filter((c) => c.character?.is_biccame_musume && favorites.includes(c.id))
  const displayFavorites = favoriteCharacters.slice(0, 5)
  const visitedCharacters = characters.filter((c) => stores.includes(c.id))
  const displayVisited = visitedCharacters.slice(0, 5)

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
          {/* タイトル + ログアウト */}
          <div className='mb-4 flex items-center justify-between gap-4'>
            <h1 className='text-2xl font-bold text-foreground'>マイページ</h1>
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
              <AlertDialogContent className='rounded-2xl shadow-2xl border-transparent'>
                <AlertDialogHeader>
                  <AlertDialogTitle>ログアウトしますか？</AlertDialogTitle>
                  <AlertDialogDescription>
                    ログアウトするとマイページにアクセスできなくなります。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                  <AlertDialogAction onClick={handleLogout} variant='destructive'>
                    ログアウトする
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

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
              {visitedCharacters.length > 0 && (
                <span className='text-sm text-muted-foreground'>({visitedCharacters.length})</span>
              )}
            </div>
            {visitedCharacters.length === 0 ? (
              <p className='text-sm text-muted-foreground py-2'>{MY_PAGE_LABELS.noVisitedStores}</p>
            ) : (
              <div className='grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3'>
                {displayVisited.map((character, index) => (
                  <CharacterListCard key={character.id} character={character} index={index} />
                ))}
              </div>
            )}
          </motion.div>

          {/* 推しのビッカメ娘 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: DURATION.normal, delay: 0.45 }}
            className='space-y-3 mb-6'
          >
            <div className='flex items-center gap-2'>
              <Heart className='h-5 w-5 text-favorite fill-current' />
              <h2 className='text-xl font-bold text-foreground'>推しのビッカメ娘</h2>
              {favoriteCharacters.length > 0 && (
                <span className='text-sm text-muted-foreground'>({favoriteCharacters.length})</span>
              )}
            </div>
            {favoriteCharacters.length === 0 ? (
              <p className='text-sm text-muted-foreground py-2'>推しを登録して、まとめて応援できるよ</p>
            ) : (
              <>
                <div className='grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3'>
                  {displayFavorites.map((character, index) => (
                    <CharacterListCard key={character.id} character={character} index={index} />
                  ))}
                </div>
                <div className='mt-4 text-right'>
                  <Link
                    to='/me/favorites'
                    className='text-sm text-muted-foreground hover:text-foreground font-semibold hover:underline transition-colors'
                  >
                    {MY_PAGE_LABELS.viewAll}
                  </Link>
                </div>
              </>
            )}
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
