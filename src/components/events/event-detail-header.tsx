import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, Award, BarChart2, Heart, Share } from 'lucide-react'

import { AnimatePresence, motion } from 'motion/react'
import { Suspense, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { usePageViews } from '@/hooks/use-page-views'
import { useUserActivity } from '@/hooks/use-user-activity'
import { cn } from '@/lib/utils'
import { EVENT_CATEGORY_LABELS } from '@/locales/app.content'
import { CATEGORY_STYLE, STATUS_BADGE_DETAIL } from '@/locales/component'
import type { Event } from '@/schemas/event.dto'

type EventDetailHeaderProps = {
  event: Event
  isAuthenticated: boolean
  onBack?: () => void
}

type EventStatsBadgesProps = {
  event: Event
  onStatsUpdate: () => void
}

/**
 * ハートアニメーション用のパーティクル角度
 */
const HEART_PARTICLES = [0, 60, 120, 180, 240, 300] as const

/**
 * 花火アニメーション用のパーティクル角度とカラー
 */
const FIREWORK_PARTICLES = [
  { angle: 0, color: 'bg-amber-400' },
  { angle: 30, color: 'bg-orange-400' },
  { angle: 60, color: 'bg-yellow-400' },
  { angle: 90, color: 'bg-amber-400' },
  { angle: 120, color: 'bg-orange-400' },
  { angle: 150, color: 'bg-yellow-400' },
  { angle: 180, color: 'bg-amber-400' },
  { angle: 210, color: 'bg-orange-400' },
  { angle: 240, color: 'bg-yellow-400' },
  { angle: 270, color: 'bg-amber-400' },
  { angle: 300, color: 'bg-orange-400' },
  { angle: 330, color: 'bg-yellow-400' }
] as const

/**
 * イベント統計バッジコンポーネント
 * ログイン中はクリックでお気に入り・達成報告の登録/解除が可能
 */
const EventStatsBadges = ({ event, onStatsUpdate }: EventStatsBadgesProps) => {
  const { user } = useAuth()
  const { data: pageViews } = usePageViews(`/events/${event.uuid}`)
  const {
    isInterested,
    isCompleted,
    addInterestedEvent,
    removeInterestedEvent,
    addCompletedEvent,
    removeCompletedEvent
  } = useUserActivity()

  const interested = isInterested(event.uuid)
  const completed = isCompleted(event.uuid)

  // アニメーション用のstate
  const [showHeartAnimation, setShowHeartAnimation] = useState(false)
  const [showFireworkAnimation, setShowFireworkAnimation] = useState(false)

  /**
   * お気に入りの切り替え
   */
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

  /**
   * 達成報告の切り替え
   */
  const handleToggleCompleted = () => {
    if (!user) return
    if (completed) {
      removeCompletedEvent(event.uuid, { onSuccess: () => onStatsUpdate() })
    } else {
      setShowFireworkAnimation(true)
      setTimeout(() => setShowFireworkAnimation(false), 800)
      addCompletedEvent(event.uuid, { onSuccess: () => onStatsUpdate() })
    }
  }

  const isLoggedIn = !!user

  /**
   * シェアボタンの処理
   */
  const handleShare = async () => {
    const url = `${window.location.origin}/events/${event.uuid}`
    const text = `${event.title}`

    if (navigator.share) {
      try {
        await navigator.share({ title: event.title, text, url })
      } catch (error) {
        // ユーザーがキャンセルした場合は何もしない
        if ((error as Error).name !== 'AbortError') {
          console.error('Share failed:', error)
        }
      }
    } else {
      // Web Share APIが使えない場合はクリップボードにコピー
      await navigator.clipboard.writeText(url)
      toast.success('URLをコピーしました')
    }
  }

  return (
    <div className='flex items-center justify-between mt-3'>
      <div className='flex items-center'>
        {/* 気になるボタン */}
        <button
          type='button'
          onClick={isLoggedIn ? handleToggleInterested : undefined}
          disabled={!isLoggedIn}
          className={cn(
            'flex items-center gap-1.5 text-sm transition-colors group min-w-16',
            isLoggedIn ? 'cursor-pointer' : 'cursor-not-allowed opacity-50',
            interested ? 'text-pink-500' : 'text-gray-400',
            isLoggedIn && !interested && 'hover:text-pink-400'
          )}
        >
          <Heart
            className={cn(
              'h-5 w-5 transition-all',
              interested && 'fill-pink-500',
              isLoggedIn && !interested && 'group-hover:scale-110'
            )}
          />
          <span className='tabular-nums'>{event.interestedCount}</span>
        </button>

        {/* 達成ボタン */}
        <button
          type='button'
          onClick={isLoggedIn ? handleToggleCompleted : undefined}
          disabled={!isLoggedIn}
          className={cn(
            'flex items-center gap-1.5 text-sm transition-colors group min-w-16',
            isLoggedIn ? 'cursor-pointer' : 'cursor-not-allowed opacity-50',
            completed ? 'text-amber-500' : 'text-gray-400',
            isLoggedIn && !completed && 'hover:text-amber-400'
          )}
        >
          <Award
            className={cn(
              'h-5 w-5 transition-all',
              completed && 'fill-amber-200',
              isLoggedIn && !completed && 'group-hover:scale-110'
            )}
          />
          <span className='tabular-nums'>{event.completedCount}</span>
        </button>

        {/* 閲覧数 */}
        <div className='flex items-center gap-1.5 text-sm text-gray-400 min-w-16'>
          <BarChart2 className='h-5 w-5' />
          <span className='tabular-nums'>{pageViews.total}</span>
        </div>
      </div>

      {/* シェアボタン */}
      <button
        type='button'
        onClick={handleShare}
        className='flex items-center gap-1.5 text-sm text-gray-400 hover:text-blue-500 transition-colors group'
      >
        <Share className='h-5 w-5 transition-all group-hover:scale-110' />
      </button>

      {/* 画面中央のアニメーション */}
      <AnimatePresence>
        {showHeartAnimation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className='fixed inset-0 flex items-center justify-center pointer-events-none z-50'
          >
            {/* 背景のフラッシュ */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.1, 0] }}
              transition={{ duration: 0.4 }}
              className='absolute inset-0 bg-pink-300'
            />
            {/* 中央のハート */}
            <motion.div
              initial={{ scale: 0, rotate: -15 }}
              animate={{ scale: [0, 1.2, 1], rotate: [-15, 10, 0] }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            >
              <Heart className='h-24 w-24 fill-pink-500 text-pink-500 drop-shadow-lg' />
            </motion.div>
            {/* 放射状のハート */}
            {HEART_PARTICLES.map((angle) => (
              <motion.div
                key={`heart-center-${angle}`}
                initial={{ opacity: 1, scale: 0.5, x: 0, y: 0 }}
                animate={{
                  opacity: [1, 1, 0],
                  scale: [0.5, 1, 0.8],
                  x: Math.cos((angle * Math.PI) / 180) * 120,
                  y: Math.sin((angle * Math.PI) / 180) * 120
                }}
                transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
                className='absolute pointer-events-none'
              >
                <Heart className='h-8 w-8 fill-pink-400 text-pink-400' />
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showFireworkAnimation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className='fixed inset-0 flex items-center justify-center pointer-events-none z-50'
          >
            {/* 背景のフラッシュ */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.15, 0] }}
              transition={{ duration: 0.5 }}
              className='absolute inset-0 bg-amber-300'
            />
            {/* 中央のアワード */}
            <motion.div
              initial={{ scale: 0, y: 20 }}
              animate={{ scale: [0, 1.3, 1], y: [20, -10, 0] }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            >
              <Award className='h-28 w-28 text-amber-500 fill-amber-200 drop-shadow-lg' />
            </motion.div>
            {/* 花火パーティクル */}
            {FIREWORK_PARTICLES.map((particle) => (
              <motion.div
                key={`firework-center-${particle.angle}`}
                initial={{ opacity: 1, scale: 0, x: 0, y: 0 }}
                animate={{
                  opacity: [1, 1, 0],
                  scale: [0.5, 1.5, 1],
                  x: Math.cos((particle.angle * Math.PI) / 180) * 150,
                  y: Math.sin((particle.angle * Math.PI) / 180) * 150
                }}
                transition={{ duration: 0.7, ease: 'easeOut', delay: 0.05 }}
                className='absolute pointer-events-none'
              >
                <div className={cn('w-4 h-4 rounded-full', particle.color)} />
              </motion.div>
            ))}
            {/* キラキラ追加 */}
            {HEART_PARTICLES.map((angle) => (
              <motion.div
                key={`sparkle-${angle}`}
                initial={{ opacity: 0, scale: 0 }}
                animate={{
                  opacity: [0, 1, 0],
                  scale: [0, 1, 0.5],
                  x: Math.cos(((angle + 30) * Math.PI) / 180) * 100,
                  y: Math.sin(((angle + 30) * Math.PI) / 180) * 100
                }}
                transition={{ duration: 0.6, ease: 'easeOut', delay: 0.15 }}
                className='absolute pointer-events-none'
              >
                <div className='w-2 h-2 bg-yellow-300 rotate-45' />
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * イベント詳細ページのヘッダーコンポーネント
 */
export const EventDetailHeader = ({ event, isAuthenticated, onBack }: EventDetailHeaderProps) => {
  const categoryStyle = CATEGORY_STYLE[event.category]
  const queryClient = useQueryClient()

  const handleStatsUpdate = () => {
    queryClient.invalidateQueries({ queryKey: ['events', event.uuid] })
  }

  return (
    <>
      {/* 戻るボタン */}
      {onBack && (
        <div className='pb-2'>
          <Button variant='ghost' size='sm' className='text-gray-600 hover:text-gray-900 -ml-2' onClick={onBack}>
            <ArrowLeft className='h-4 w-4 mr-1' />
            戻る
          </Button>
        </div>
      )}

      {/* ヘッダー */}
      <motion.div
        key={`header-${event.uuid}`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className='mb-6'
      >
        <div className='flex items-center justify-between gap-2 mb-2'>
          <div className='flex items-center gap-2'>
            <Badge className={`${categoryStyle} border`}>{EVENT_CATEGORY_LABELS[event.category]}</Badge>
            {STATUS_BADGE_DETAIL[event.status]()}
          </div>
          {isAuthenticated && (
            <Button
              asChild
              size='sm'
              className='rounded-full px-2 py-0.5 h-auto text-xs font-medium bg-transparent text-gray-900 border border-gray-300 hover:bg-gray-100'
            >
              <Link to='/admin/events/$uuid' params={{ uuid: event.uuid }}>
                編集
              </Link>
            </Button>
          )}
        </div>
        <h1 className='text-2xl font-bold text-gray-900'>{event.title}</h1>
        <Suspense fallback={null}>
          <EventStatsBadges event={event} onStatsUpdate={handleStatsUpdate} />
        </Suspense>
      </motion.div>
    </>
  )
}
