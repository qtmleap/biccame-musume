import { Link } from '@tanstack/react-router'
import { Package, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'
import { useEventGroups } from '@/hooks/use-event-groups'
import { useMediaQuery } from '@/hooks/use-media-query'
import { DURATION } from '@/lib/motion'
import { getStickerRotation, STICKER_HOVER_TRANSITION, STICKER_SHADOW_SM, STICKER_TAPES } from '@/lib/sticker'
import { cn } from '@/lib/utils'

const MAX_GROUPS_ON_HOME = 3

type EventGroupCardProps = {
  group: { uuid: string; title: string; eventCount: number }
  index: number
}

const EventGroupCard = ({ group, index }: EventGroupCardProps) => {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const rotation = isDesktop ? getStickerRotation(index) : 0
  const tape = STICKER_TAPES[index % STICKER_TAPES.length]

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.normal, delay: index * 0.08 }}
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
        <Link
          to='/events/group/$id'
          params={{ id: group.uuid }}
          className='group relative block h-full rounded-xl border border-border bg-card p-4 hover:border-action-award/40'
        >
          {tape && (
            <div aria-hidden className={cn('absolute rounded-sm', tape.position, tape.size, tape.color, tape.angle)} />
          )}
          <div className='flex items-center gap-3'>
            <div className='shrink-0 p-2 rounded-lg bg-action-award/15 text-action-award'>
              <Sparkles className='size-4' />
            </div>
            <div className='min-w-0 flex-1'>
              <h3 className='text-base font-semibold text-foreground group-hover:text-action-award line-clamp-2'>
                {group.title}
              </h3>
              <p className='mt-1 flex items-center gap-1 text-xs text-muted-foreground'>
                <Package className='size-3.5' />
                <span className='tabular-nums'>{group.eventCount}</span> 件
              </p>
            </div>
          </div>
        </Link>
      </motion.div>
    </motion.div>
  )
}

/**
 * トップページのイベントグループ一覧。
 * 開催中の EventGroup を最大 3 件、コンパクトに表示する。
 */
export const EventGroupList = () => {
  const { data: groups } = useEventGroups()
  const visibleGroups = groups.slice(0, MAX_GROUPS_ON_HOME)

  if (visibleGroups.length === 0) return null

  return (
    <section>
      <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-6xl'>
        <div className='flex items-center gap-2 mb-4'>
          <Sparkles className='h-5 w-5 text-action-award' />
          <h2 className='text-base font-bold text-foreground'>開催中のイベントグループ</h2>
        </div>

        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'>
          {visibleGroups.map((group, index) => (
            <EventGroupCard key={group.uuid} group={group} index={index} />
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.normal, delay: 0.6, ease: 'easeOut' }}
          className='mt-4 text-right'
        >
          <Link
            to='/events/groups'
            className='text-sm text-muted-foreground hover:text-foreground font-semibold hover:underline transition-colors'
          >
            イベントグループ一覧
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
