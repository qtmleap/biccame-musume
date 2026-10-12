import { Link } from '@tanstack/react-router'
import { ChevronRight, Sparkles } from 'lucide-react'
import { Suspense } from 'react'
import { useEventGroups } from '@/hooks/use-event-groups'

const EventGroupBannerInner = () => {
  const { data: groups } = useEventGroups()
  if (groups.length === 0) return null

  const topGroup = groups[0]

  return (
    <Link
      to='/events/groups'
      className='group flex items-center gap-3 rounded-lg border border-action-award/30 bg-action-award/5 px-4 py-3 transition-colors hover:border-action-award/50 hover:bg-action-award/10'
    >
      <div
        aria-hidden='true'
        className='flex size-9 shrink-0 items-center justify-center rounded-full bg-action-award/15 text-action-award'
      >
        <Sparkles className='size-4' />
      </div>
      <div className='min-w-0 flex-1'>
        <p className='text-sm font-semibold text-foreground'>
          開催中のイベントグループ
          {groups.length > 1 && <span className='ml-1 text-xs text-muted-foreground'>（{groups.length} 件）</span>}
        </p>
        <p className='mt-0.5 text-xs text-muted-foreground truncate'>
          {topGroup.title}
          {groups.length > 1 && ' ほか'}
        </p>
      </div>
      <ChevronRight className='size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5' />
    </Link>
  )
}

/**
 * イベント一覧ページに置く、イベントグループ一覧への導線バナー。
 * EventGroup が 0 件のときは何も表示しない。
 */
export const EventGroupBanner = () => (
  <Suspense fallback={null}>
    <EventGroupBannerInner />
  </Suspense>
)
