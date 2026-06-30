import { Award, BarChart2, Heart } from 'lucide-react'
import { useState } from 'react'
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
import { useAuth } from '@/hooks/use-auth'
import { usePageViews } from '@/hooks/use-page-views'
import { useUserActivity } from '@/hooks/use-user-activity'
import { cn } from '@/lib/utils'
import { STORE_NAME_LABELS } from '@/locales/app.content'
import type { Event } from '@/schemas/event.dto'
import type { StoreKey } from '@/schemas/store.dto'
import { EventShareButton } from './event-share-button'
import { FireworkBurstOverlay, HeartBurstOverlay } from './event-stats-animations'

type EventStatsBadgesProps = {
  event: Event
  onStatsUpdate: () => void
}

/**
 * イベント統計バッジコンポーネント
 * ログイン中はクリックでお気に入り・達成報告の登録/解除が可能
 */
export const EventStatsBadges = ({ event, onStatsUpdate }: EventStatsBadgesProps) => {
  const { user } = useAuth()
  const { data: pageViews } = usePageViews(`/events/${event.uuid}`)
  const { isInterested, isCompleted, addInterestedEvent, removeInterestedEvent, addCompletedEvent } = useUserActivity()

  const interested = isInterested(event.uuid)
  const completed = isCompleted(event.uuid)

  const [showHeartAnimation, setShowHeartAnimation] = useState(false)
  const [showFireworkAnimation, setShowFireworkAnimation] = useState(false)
  const [confirmCompletedOpen, setConfirmCompletedOpen] = useState(false)

  const handleToggleInterested = () => {
    if (!user) return
    if (interested) {
      removeInterestedEvent(event.uuid, { onSuccess: () => onStatsUpdate() })
    } else {
      setShowHeartAnimation(true)
      setTimeout(() => setShowHeartAnimation(false), 600)
      addInterestedEvent(event.uuid, { onSuccess: () => onStatsUpdate() })
    }
  }

  const handleConfirmCompleted = () => {
    setConfirmCompletedOpen(false)
    setShowFireworkAnimation(true)
    setTimeout(() => setShowFireworkAnimation(false), 800)
    addCompletedEvent(event.uuid, { onSuccess: () => onStatsUpdate() })
  }

  const isLoggedIn = !!user
  const isUpcoming = event.status === 'upcoming'
  const completedDisabled = !isLoggedIn || isUpcoming || completed
  const storeKey = event.stores[0]
  const storeName = storeKey ? (STORE_NAME_LABELS[storeKey as StoreKey] ?? storeKey) : undefined

  return (
    <div className='flex items-center justify-between mt-3'>
      <div className='flex items-center'>
        {/* 気になるボタン */}
        <button
          type='button'
          onClick={isLoggedIn ? handleToggleInterested : undefined}
          disabled={!isLoggedIn}
          aria-disabled={!isLoggedIn || undefined}
          aria-label={!isLoggedIn ? 'ログインが必要です' : interested ? '気になるを解除する' : '気になる登録をする'}
          title={!isLoggedIn ? 'ログインが必要です' : undefined}
          className={cn(
            'flex items-center gap-1.5 text-sm transition-colors group min-w-16',
            isLoggedIn ? 'cursor-pointer' : 'cursor-not-allowed opacity-50',
            interested ? 'text-action-interest' : 'text-foreground/70',
            isLoggedIn && !interested && 'hover:text-action-interest/80'
          )}
        >
          <Heart
            className={cn(
              'h-5 w-5 transition-all',
              interested && 'fill-action-interest',
              isLoggedIn && !interested && 'group-hover:scale-110'
            )}
          />
          <span className='tabular-nums'>{event.interestedCount}</span>
        </button>

        {/* 達成ボタン（開催前 / 達成済みは無効。確定後の取り消しは不可） */}
        <AlertDialog open={confirmCompletedOpen} onOpenChange={setConfirmCompletedOpen}>
          <AlertDialogTrigger asChild>
            <button
              type='button'
              disabled={completedDisabled}
              aria-disabled={completedDisabled || undefined}
              aria-pressed={completed}
              aria-label={
                !isLoggedIn
                  ? 'ログインが必要です'
                  : isUpcoming
                    ? '開催前のため達成できません'
                    : completed
                      ? '達成済み（解除不可）'
                      : '達成報告をする'
              }
              title={
                !isLoggedIn
                  ? 'ログインが必要です'
                  : isUpcoming
                    ? '開催前のため達成できません'
                    : completed
                      ? '達成済み（解除不可）'
                      : undefined
              }
              className={cn(
                'flex items-center gap-1.5 text-sm transition-colors group min-w-16',
                completedDisabled ? 'cursor-not-allowed' : 'cursor-pointer',
                !isLoggedIn || isUpcoming ? 'opacity-50' : undefined,
                completed ? 'text-action-award' : 'text-foreground/70',
                !completedDisabled && 'hover:text-action-award/80'
              )}
            >
              <Award
                className={cn(
                  'h-5 w-5 transition-all',
                  completed && 'fill-action-award-soft',
                  !completedDisabled && 'group-hover:scale-110'
                )}
              />
              <span className='tabular-nums'>{event.completedCount}</span>
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent className='rounded-2xl shadow-2xl border-transparent'>
            <AlertDialogHeader>
              <AlertDialogTitle>このイベントを達成済みにしますか？</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className='space-y-2'>
                  <div className='rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground'>
                    {storeName && <p className='font-semibold'>{storeName}</p>}
                    <p className={cn(storeName && 'mt-0.5 text-xs text-muted-foreground')}>{event.title}</p>
                  </div>
                  <p>一度登録すると取り消しできないので、実際にもらったイベントだけ申告してね。</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>いいえ</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmCompleted} variant='destructive'>
                はい
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* 閲覧数 */}
        <div className='flex items-center gap-1.5 text-sm text-foreground/70 min-w-16'>
          <BarChart2 className='h-5 w-5' />
          <span className='tabular-nums'>{pageViews.total}</span>
        </div>
      </div>

      <EventShareButton title={event.title} uuid={event.uuid} />

      <HeartBurstOverlay visible={showHeartAnimation} />
      <FireworkBurstOverlay visible={showFireworkAnimation} />
    </div>
  )
}
