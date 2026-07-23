import { createFileRoute, Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { ArrowLeft, Award, Calendar, ChevronLeft, ChevronRight, Clock, Crown, Medal } from 'lucide-react'
import { motion } from 'motion/react'
import { Suspense, useState } from 'react'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { useAdminBadgeRanking } from '@/hooks/use-admin-badge-ranking'
import { useAdminUserBadges, usePrefetchAdminUserBadges } from '@/hooks/use-admin-user-badges'
import { useMediaQuery } from '@/hooks/use-media-query'
import { getBadgeIcon } from '@/lib/badge-icons'
import { DURATION } from '@/lib/motion'
import { getStickerRotation, STICKER_HOVER_TRANSITION, STICKER_SHADOW_SM, STICKER_TAPES } from '@/lib/sticker'
import { cn } from '@/lib/utils'
import type { BadgeRarity } from '@/schemas/badge.dto'

const PAGE_SIZE = 100

const RARITY_ORDER: BadgeRarity[] = ['mythic', 'legendary', 'epic', 'rare', 'common']

const RARITY_LABEL: Record<BadgeRarity, string> = {
  common: 'コモン',
  rare: 'レア',
  epic: 'エピック',
  legendary: 'レジェンダリ',
  mythic: 'ミシック'
}

// badge-card.tsx の RARITY_STYLES.chip と揃えて塗りベースにする
const RARITY_CHIP: Record<BadgeRarity, string> = {
  common: 'bg-muted text-muted-foreground',
  rare: 'bg-status-upcoming text-status-upcoming-foreground',
  epic: 'bg-favorite text-favorite-foreground',
  legendary: 'bg-rank-gold text-rank-gold-foreground',
  mythic: 'bg-gradient-to-br from-rank-mythic-from via-rank-mythic-via to-rank-mythic-to text-rank-mythic-foreground'
}

// 順位別のカード装飾。上位3位はレアリティ tint + glow で華やかに、
// それ以下は真っ白から muted 寄りに落として面の白抜け感を消す。
const rankCardStyle = (rank: number): string => {
  if (rank === 1) {
    return 'bg-gradient-to-br from-rank-gold/20 via-card to-card border-rank-gold/40 shadow-[0_0_28px_-6px_var(--rank-gold)]'
  }
  if (rank === 2) {
    return 'bg-gradient-to-br from-rank-silver/30 via-card to-card border-rank-silver shadow-[0_0_22px_-6px_var(--rank-silver)]'
  }
  if (rank === 3) {
    return 'bg-gradient-to-br from-rank-bronze/25 via-card to-card border-rank-bronze/40 shadow-[0_0_22px_-6px_var(--rank-bronze)]'
  }
  return 'bg-gradient-to-br from-muted/50 via-card to-card border-border/60'
}

const RankBadge = ({ rank }: { rank: number }) => {
  if (rank === 1) {
    return (
      <div className='relative flex items-center justify-center size-11 rounded-full bg-rank-gold text-rank-gold-foreground shadow-inner ring-2 ring-rank-gold/50'>
        <Crown className='size-5' strokeWidth={2.4} />
      </div>
    )
  }
  if (rank === 2) {
    return (
      <div className='relative flex items-center justify-center size-11 rounded-full bg-rank-silver text-rank-silver-foreground shadow-inner ring-2 ring-rank-silver'>
        <Medal className='size-5' strokeWidth={2.4} />
      </div>
    )
  }
  if (rank === 3) {
    return (
      <div className='relative flex items-center justify-center size-11 rounded-full bg-rank-bronze text-rank-bronze-foreground shadow-inner ring-2 ring-rank-bronze/50'>
        <Award className='size-5' strokeWidth={2.4} />
      </div>
    )
  }
  return (
    <div className='flex items-center justify-center size-11 rounded-full bg-muted text-muted-foreground border border-border/60'>
      <span className='font-numeric tabular-nums font-black text-base'>{rank}</span>
    </div>
  )
}

type Entry = {
  rank: number
  uid: string
  displayName: string | null
  thumbnailURL?: string | null
  createdAt: string
  earnedCount: number
  lastEarnedAt: string
  rarityBreakdown: Record<BadgeRarity, number>
}

const RankingCard = ({ entry, index }: { entry: Entry; index: number }) => {
  const [open, setOpen] = useState(false)
  const prefetchBadges = usePrefetchAdminUserBadges()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const rotation = isDesktop ? getStickerRotation(index) : 0
  const tape = STICKER_TAPES[index % STICKER_TAPES.length]
  const displayName = entry.displayName === null ? '(未設定)' : entry.displayName
  const prefetch = () => prefetchBadges(entry.uid)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.normal, delay: Math.min(index * 0.02, 0.4) }}
        className='h-full'
        style={{ filter: STICKER_SHADOW_SM }}
      >
        <motion.div
          className='h-full'
          style={{ rotate: rotation }}
          whileHover={{ scale: 1.02, rotate: 0 }}
          whileTap={{ scale: 0.98 }}
          transition={STICKER_HOVER_TRANSITION}
        >
          <DialogTrigger asChild>
            <button
              type='button'
              className='relative block w-full h-full text-left rounded-2xl cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              aria-label={`${displayName} の獲得バッジ一覧を表示`}
              onMouseEnter={prefetch}
              onFocus={prefetch}
              onTouchStart={prefetch}
            >
              {tape && (
                <div
                  aria-hidden
                  className={cn('absolute z-10 rounded-sm', tape.position, tape.size, tape.color, tape.angle)}
                />
              )}
              <div className={cn('rounded-2xl border overflow-hidden flex h-full flex-col', rankCardStyle(entry.rank))}>
                {/* Header — rank badge + avatar + name */}
                <div className='p-4 pb-3 flex items-center gap-3'>
                  <RankBadge rank={entry.rank} />
                  <Avatar className='size-10 shrink-0 ring-2 ring-card'>
                    {entry.thumbnailURL ? <AvatarImage src={entry.thumbnailURL} alt='' /> : null}
                    <AvatarFallback className='text-sm bg-brand/10 text-brand'>
                      {entry.displayName === null ? '?' : entry.displayName.slice(0, 1)}
                    </AvatarFallback>
                  </Avatar>
                  <div className='min-w-0 flex-1'>
                    <div className='font-bold text-foreground truncate text-sm md:text-base leading-tight'>
                      {displayName}
                    </div>
                  </div>
                </div>

                {/* Earned count — big number */}
                <div className='px-4 pb-2 text-center'>
                  <div className='inline-flex items-baseline gap-1'>
                    <span className='font-numeric tabular-nums font-black text-4xl md:text-5xl text-foreground leading-none'>
                      {entry.earnedCount}
                    </span>
                    <span className='text-xs text-muted-foreground'>個</span>
                  </div>
                </div>

                {/* Rarity breakdown chips */}
                <div className='px-4 pb-3 flex flex-wrap justify-center gap-1.5'>
                  {RARITY_ORDER.map((r) => {
                    const n = entry.rarityBreakdown[r]
                    if (n === 0) return null
                    return (
                      <span
                        key={r}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm',
                          RARITY_CHIP[r]
                        )}
                      >
                        <span className='opacity-90'>{RARITY_LABEL[r]}</span>
                        <span className='font-numeric tabular-nums font-black'>{n}</span>
                      </span>
                    )
                  })}
                </div>

                {/* Footer — timestamps */}
                <div className='mt-auto border-t border-border/40 bg-background/40 px-4 py-2 flex items-center justify-between text-[10px] text-muted-foreground font-numeric tabular-nums'>
                  <span className='inline-flex items-center gap-1'>
                    <Clock className='size-3' />
                    {dayjs(entry.lastEarnedAt).format('YYYY/MM/DD')}
                  </span>
                  <span className='inline-flex items-center gap-1'>
                    <Calendar className='size-3' />
                    {dayjs(entry.createdAt).format('YYYY/MM/DD')}
                  </span>
                </div>
              </div>
            </button>
          </DialogTrigger>
        </motion.div>
      </motion.div>
      <UserBadgesDialogContent entry={entry} />
    </Dialog>
  )
}

const UserBadgesDialogContent = ({ entry }: { entry: Entry }) => {
  const displayName = entry.displayName === null ? '(未設定)' : entry.displayName
  return (
    <DialogContent className='sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col'>
      <DialogHeader>
        <div className='flex items-center gap-3'>
          <Avatar className='size-10 shrink-0 ring-2 ring-card-border'>
            {entry.thumbnailURL ? <AvatarImage src={entry.thumbnailURL} alt='' /> : null}
            <AvatarFallback className='text-sm bg-brand/10 text-brand'>
              {entry.displayName === null ? '?' : entry.displayName.slice(0, 1)}
            </AvatarFallback>
          </Avatar>
          <div className='min-w-0 flex-1 text-left'>
            <DialogTitle className='text-base md:text-lg truncate'>{displayName}</DialogTitle>
            <DialogDescription className='text-xs mt-0.5'>
              {entry.rank} 位 ・ {entry.earnedCount} 個獲得
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className='mt-2 flex-1 overflow-y-auto -mx-6 px-6'>
        <Suspense fallback={<div className='py-8 text-center text-sm text-muted-foreground'>バッジを読み込み中…</div>}>
          <UserBadgesList uid={entry.uid} />
        </Suspense>
      </div>
    </DialogContent>
  )
}

const UserBadgesList = ({ uid }: { uid: string }) => {
  const { data } = useAdminUserBadges(uid)
  if (data.badges.length === 0) {
    return <div className='py-8 text-center text-sm text-muted-foreground'>獲得バッジがありません</div>
  }
  return (
    <ul className='space-y-1.5 py-1'>
      {data.badges.map((b) => {
        const Icon = getBadgeIcon(b.iconName)
        return (
          <li key={b.code} className='flex items-center gap-3 rounded-lg border border-border/50 bg-card/60 px-3 py-2'>
            <span
              className={cn(
                'inline-flex items-center justify-center rounded-full size-9 shrink-0 shadow-inner',
                RARITY_CHIP[b.rarity]
              )}
              aria-hidden
            >
              <Icon className='size-4.5' strokeWidth={2.2} />
            </span>
            <div className='min-w-0 flex-1'>
              <div className='text-sm font-semibold text-foreground truncate leading-tight'>{b.name}</div>
              <div className='mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground font-numeric tabular-nums'>
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                    RARITY_CHIP[b.rarity]
                  )}
                >
                  {RARITY_LABEL[b.rarity]}
                </span>
                <span>{dayjs(b.earnedAt).format('YYYY/MM/DD HH:mm')}</span>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

const RankingGrid = ({ page, onPageChange }: { page: number; onPageChange: (next: number) => void }) => {
  const offset = page * PAGE_SIZE
  const { data } = useAdminBadgeRanking(PAGE_SIZE, offset)
  const { total, entries } = data
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const canPrev = page > 0
  const canNext = offset + entries.length < total

  return (
    <>
      <div className='mb-4 flex items-center justify-between text-sm text-muted-foreground'>
        <span className='tabular-nums'>
          {total === 0 ? '獲得者なし' : `${offset + 1}〜${offset + entries.length} 位 / 全 ${total} 人`}
        </span>
        <span className='tabular-nums'>
          {page + 1} / {totalPages} ページ
        </span>
      </div>

      {entries.length === 0 ? (
        <div className='rounded-xl border p-8 text-center bg-card'>
          <p className='text-sm text-muted-foreground'>該当ユーザーがいません</p>
        </div>
      ) : (
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4'>
          {entries.map((entry, i) => (
            <RankingCard key={entry.uid} entry={entry} index={i} />
          ))}
        </div>
      )}

      <div className='mt-6 flex items-center justify-center gap-2'>
        <Button variant='outline' size='sm' disabled={!canPrev} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className='size-4 mr-1' />
          前へ
        </Button>
        <Button variant='outline' size='sm' disabled={!canNext} onClick={() => onPageChange(page + 1)}>
          次へ
          <ChevronRight className='size-4 ml-1' />
        </Button>
      </div>
    </>
  )
}

const RankingContent = () => {
  const [page, setPage] = useState(0)
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
            <Link to='/admin/badges'>
              <ArrowLeft className='h-4 w-4 mr-1' />
              バッジ管理に戻る
            </Link>
          </Button>
        </div>

        <div className='mb-5 md:mb-6'>
          <h1 className='text-2xl md:text-3xl font-bold text-foreground'>バッジ所持数ランキング</h1>
          <p className='mt-2 text-sm text-muted-foreground md:text-base'>
            全ユーザーの獲得バッジ数を降順で表示。同数は初回獲得が早い順。 隠しバッジも集計対象。
          </p>
        </div>

        <Suspense fallback={<LoadingFallback />}>
          <RankingGrid page={page} onPageChange={setPage} />
        </Suspense>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/admin/badges/ranking/')({
  component: RankingContent
})
