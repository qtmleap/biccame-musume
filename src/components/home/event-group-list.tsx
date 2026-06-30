import { Link } from '@tanstack/react-router'
import { Sparkles } from 'lucide-react'
import { motion } from 'motion/react'
import { Badge } from '@/components/ui/badge'
import { useEventGroups } from '@/hooks/use-event-groups'
import { DURATION } from '@/lib/motion'
import type { EventGroupItemType } from '@/schemas/event-group.dto'

const ITEM_TYPE_LABELS: Record<EventGroupItemType, string> = {
  card: '名刺',
  badge: '缶バッジ',
  other: 'アイテム'
}

const ITEM_TYPE_ICONS: Record<EventGroupItemType, string> = {
  card: '🎴',
  badge: '📛',
  other: '✨'
}

const MAX_GROUPS_ON_HOME = 3

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
            <motion.div
              key={group.uuid}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DURATION.normal, delay: index * 0.08 }}
            >
              <Link
                to='/events/group/$id'
                params={{ id: group.uuid }}
                className='group block h-full rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-action-award/40 hover:shadow-md'
              >
                <div className='flex items-start gap-3'>
                  <div
                    aria-hidden='true'
                    className='flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-xl'
                  >
                    {ITEM_TYPE_ICONS[group.itemType]}
                  </div>
                  <div className='min-w-0 flex-1'>
                    <Badge variant='secondary' className='text-[10px]'>
                      {ITEM_TYPE_LABELS[group.itemType]}コンプリート
                    </Badge>
                    <h3 className='mt-1 text-sm font-bold text-foreground group-hover:text-action-award line-clamp-2'>
                      {group.title}
                    </h3>
                    <p className='mt-1 text-xs text-muted-foreground'>所属イベント: {group.eventCount} 件</p>
                  </div>
                </div>
              </Link>
            </motion.div>
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
