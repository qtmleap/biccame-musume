import { createFileRoute, Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { useAtomValue } from 'jotai'
import { Filter, Gift, Settings } from 'lucide-react'
import { Suspense, useMemo, useState } from 'react'
import { prefectureToRegion, regionFilterAtom } from '@/atoms/filterAtom'
import { RegionFilterControl } from '@/components/characters/region-filter-control'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { EventGanttChart } from '@/components/events/event-gantt-chart'
import { Checkbox } from '@/components/ui/checkbox'
import { useCharacters } from '@/hooks/useCharacters'
import { useEvents } from '@/hooks/useEvents'
import { type Event, EventCategorySchema } from '@/schemas/event.dto'

/**
 * カテゴリラベル
 */
const CATEGORY_LABELS: Record<Event['category'], string> = {
  ackey: 'アクキー',
  limited_card: '限定名刺',
  regular_card: '通年名刺',
  other: 'その他'
}

/**
 * カテゴリチェックボックス色
 */
const CATEGORY_CHECKBOX_COLORS: Record<Event['category'], string> = {
  ackey: 'border-amber-500 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500',
  limited_card: 'border-purple-500 data-[state=checked]:bg-purple-500 data-[state=checked]:border-purple-500',
  regular_card: 'border-blue-500 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500',
  other: 'border-pink-500 data-[state=checked]:bg-pink-500 data-[state=checked]:border-pink-500'
}

/**
 * イベント一覧のコンテンツ
 */
const EventsContent = () => {
  const { data: events = [], isLoading } = useEvents()
  const { data: characters = [] } = useCharacters()
  const [categoryFilter, setCategoryFilter] = useState<Set<Event['category']>>(
    new Set(['ackey', 'limited_card', 'regular_card', 'other'])
  )
  const regionFilter = useAtomValue(regionFilterAtom)

  // 店舗キー(id)から都道府県を取得するマップ
  const storePrefectureMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const char of characters) {
      if (char.id && char.prefecture) {
        map.set(char.id, char.prefecture)
      }
    }
    console.log('Store prefecture map:', Object.fromEntries(map))
    return map
  }, [characters])

  /**
   * カテゴリフィルターのトグル
   */
  const toggleCategory = (category: Event['category']) => {
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
    const currentTime = dayjs()
    console.log('Filtering with region:', regionFilter)
    console.log('Total events:', events.length)
    return events
      .filter((event) => {
        // カテゴリフィルター
        if (!categoryFilter.has(event.category)) return false

        // 地域フィルター
        if (regionFilter !== 'all') {
          console.log('Event:', event.name, 'Stores:', event.stores)
          // 店舗がない場合は表示しない
          if (!event.stores || event.stores.length === 0) {
            console.log('  -> No stores, filtered out')
            return false
          }
          // いずれかの店舗が選択された地域に属するかチェック
          const hasMatchingStore = event.stores.some((storeKey) => {
            const prefecture = storePrefectureMap.get(storeKey)
            console.log('  Store key:', storeKey, '-> Prefecture:', prefecture)
            if (!prefecture) return false
            const region = prefectureToRegion[prefecture]
            console.log('  Region:', region, 'vs filter:', regionFilter)
            return region === regionFilter
          })
          console.log('  -> hasMatchingStore:', hasMatchingStore)
          if (!hasMatchingStore) return false
        }

        const startDate = dayjs(event.startDate)
        const endDate = event.endDate ? dayjs(event.endDate) : null

        // 終了後1週間経過したイベントは非表示
        if (endDate?.add(7, 'day').isBefore(currentTime)) {
          return false
        }

        // 開催中: 開始日が現在以前で、終了日がないか終了日が現在以降
        const isOngoing = startDate.isBefore(currentTime) && (!endDate || endDate.isAfter(currentTime))
        // 開催予定: 開始日が現在以降
        const isUpcoming = startDate.isAfter(currentTime)
        // 終了後1週間以内: 終了日があり、終了日から1週間以内
        const isRecentlyEnded = endDate?.isBefore(currentTime) && endDate.add(7, 'day').isAfter(currentTime)

        return isOngoing || isUpcoming || isRecentlyEnded
      })
      .sort((a, b) => dayjs(a.startDate).valueOf() - dayjs(b.startDate).valueOf())
  }, [events, categoryFilter, regionFilter, storePrefectureMap])

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
      <div className='w-full'>
        <div className='flex items-center gap-2 mb-3'>
          <Filter className='h-4 w-4 text-gray-600' />
          <span className='text-sm font-medium text-gray-700'>種別で絞り込み</span>
        </div>
        <div className='flex flex-wrap gap-4 text-sm'>
          {EventCategorySchema.options.map((category) => (
            <div key={category} className='flex items-center gap-2'>
              <Checkbox
                id={`category-${category}`}
                checked={categoryFilter.has(category)}
                onCheckedChange={() => toggleCategory(category)}
                className={CATEGORY_CHECKBOX_COLORS[category]}
              />
              <label htmlFor={`category-${category}`} className='cursor-pointer'>
                {CATEGORY_LABELS[category]}
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* 地域フィルター */}
      <RegionFilterControl />

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
