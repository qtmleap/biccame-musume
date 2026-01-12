import { useSuspenseQueries } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { useAtomValue } from 'jotai'
import { Gift } from 'lucide-react'
import { Suspense, useMemo } from 'react'
import { categoryFilterAtom } from '@/atoms/categoryFilterAtom'
import { prefectureToRegion, regionFilterAtom } from '@/atoms/filterAtom'
import { RegionFilterControl } from '@/components/characters/region-filter-control'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { EventCategoryFilter } from '@/components/events/event-category-filter'
import { EventGanttChart } from '@/components/events/event-gantt-chart'
import { charactersQueryKey } from '@/hooks/useCharacters'
import { client } from '@/utils/client'

/**
 * イベント一覧のコンテンツ
 */
const EventsContent = () => {
  const [eventsQuery, charactersQuery] = useSuspenseQueries({
    queries: [
      {
        queryKey: ['events'],
        queryFn: () => client.getEvents(),
        staleTime: 0,
        refetchOnMount: true
      },
      {
        queryKey: charactersQueryKey,
        queryFn: () => client.getCharacters(),
        staleTime: 1000 * 60 * 5
      }
    ]
  })

  const events = eventsQuery.data
  const characters = charactersQuery.data

  const categoryFilter = useAtomValue(categoryFilterAtom)
  const regionFilter = useAtomValue(regionFilterAtom)

  // 店舗キー(id)から都道府県を取得するマップ
  const storePrefectureMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const char of characters) {
      if (char.id && char.prefecture) {
        map.set(char.id, char.prefecture)
      }
    }
    return map
  }, [characters])

  // 開催中・開催予定のイベントをフィルタリング
  const activeEvents = useMemo(() => {
    const currentTime = dayjs()
    return events
      .filter((event) => {
        // カテゴリフィルター
        if (!categoryFilter.has(event.category)) return false

        // 地域フィルター
        if (regionFilter !== 'all') {
          // 店舗がない場合は表示しない
          if (!event.stores || event.stores.length === 0) return false
          // いずれかの店舗が選択された地域に属するかチェック
          const hasMatchingStore = event.stores.some((storeKey) => {
            const prefecture = storePrefectureMap.get(storeKey)
            if (!prefecture) return false
            return prefectureToRegion[prefecture] === regionFilter
          })
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

  return (
    <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-6xl'>
      <div className='flex flex-col gap-2'>
        {/* カテゴリフィルター */}
        <EventCategoryFilter />

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
