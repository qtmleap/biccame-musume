import { createFileRoute, Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { Gift, Settings } from 'lucide-react'
import { Suspense, useMemo, useState } from 'react'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { EventGanttChart } from '@/components/events/event-gantt-chart'
import { Checkbox } from '@/components/ui/checkbox'
import { useEvents } from '@/hooks/useEvents'
import type { AckeyCampaign } from '@/schemas/ackey-campaign.dto'

/**
 * カテゴリラベル
 */
const CATEGORY_LABELS: Record<AckeyCampaign['category'], string> = {
  ackey: 'アクキー',
  limited_card: '限定名刺',
  other: 'その他'
}

/**
 * カテゴリチェックボックス色
 */
const CATEGORY_CHECKBOX_COLORS: Record<AckeyCampaign['category'], string> = {
  ackey: 'border-amber-500 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500',
  limited_card: 'border-purple-500 data-[state=checked]:bg-purple-500 data-[state=checked]:border-purple-500',
  other: 'border-pink-500 data-[state=checked]:bg-pink-500 data-[state=checked]:border-pink-500'
}

/**
 * イベント一覧のコンテンツ
 */
const EventsContent = () => {
  const { data: events = [], isLoading } = useEvents()
  const [categoryFilter, setCategoryFilter] = useState<Set<AckeyCampaign['category']>>(
    new Set(['ackey', 'limited_card', 'other'])
  )

  /**
   * カテゴリフィルターのトグル
   */
  const toggleCategory = (category: AckeyCampaign['category']) => {
    setCategoryFilter((prev) => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

  // 開催中・開催予定のイベントをフィルタリング
  const activeEvents = useMemo(() => {
    const now = dayjs()
    return events
      .filter((event) => {
        if (event.isEnded) return false
        // カテゴリフィルター
        if (!categoryFilter.has(event.category)) return false
        const startDate = dayjs(event.startDate)
        const endDate = event.endDate ? dayjs(event.endDate) : null
        // 開催中: 開始日が現在以前で、終了日がないか終了日が現在以降
        const isOngoing = startDate.isBefore(now) && (!endDate || endDate.isAfter(now))
        // 開催予定: 開始日が現在以降
        const isUpcoming = startDate.isAfter(now)
        return isOngoing || isUpcoming
      })
      .sort((a, b) => dayjs(a.startDate).valueOf() - dayjs(b.startDate).valueOf())
  }, [events, categoryFilter])

  if (isLoading) {
    return <LoadingFallback />
  }

  return (
    <div className='mx-auto p-4 md:p-8 space-y-4 max-w-6xl'>
      {/* ヘッダー */}
      <div className='flex items-center justify-between'>
        <div>
          <div className='flex items-center gap-2 mb-2'>
            <Gift className='size-5 text-[#e50012]' />
            <h1 className='text-xl font-bold text-gray-800'>イベント一覧</h1>
          </div>
          <p className='text-sm text-gray-600'>開催中・開催予定のイベント</p>
        </div>
        <Link
          to='/admin/events'
          className='flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors'
        >
          <Settings className='size-4' />
          <span>管理</span>
        </Link>
      </div>

      {/* カテゴリフィルター */}
      <div className='flex flex-wrap gap-4 text-sm'>
        {(['ackey', 'limited_card', 'other'] as const).map((category) => (
          <label key={category} className='flex items-center gap-2 cursor-pointer'>
            <Checkbox
              checked={categoryFilter.has(category)}
              onCheckedChange={() => toggleCategory(category)}
              className={CATEGORY_CHECKBOX_COLORS[category]}
            />
            <span>{CATEGORY_LABELS[category]}</span>
          </label>
        ))}
      </div>

      {/* ガントチャート */}
      {activeEvents.length > 0 ? (
        <EventGanttChart events={activeEvents} />
      ) : (
        <div className='text-center py-12 text-gray-500'>
          <Gift className='size-12 mx-auto mb-4 opacity-30' />
          <p>開催中・開催予定のイベントはありません</p>
        </div>
      )}
    </div>
  )
}

/**
 * イベント一覧ページ
 */
const EventsPage = () => {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <EventsContent />
    </Suspense>
  )
}

export const Route = createFileRoute('/events/')({
  component: EventsPage
})
