import { useSuspenseQueries } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { useAtom, useAtomValue } from 'jotai'
import { Calendar, Filter, Gift, LayoutGrid, Settings } from 'lucide-react'
import { Suspense, useMemo, useState } from 'react'
import { categoryFilterAtom } from '@/atoms/categoryFilterAtom'
import { eventListStatusFilterAtom } from '@/atoms/eventListStatusFilterAtom'
import { eventViewModeAtom } from '@/atoms/eventViewModeAtom'
import { prefectureToRegion, regionFilterAtom } from '@/atoms/filterAtom'
import { RegionFilterControl } from '@/components/characters/region-filter-control'
import { FilterHeader } from '@/components/common/filter-header'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { EventCategoryFilter } from '@/components/events/event-category-filter'
import { EventGanttChart } from '@/components/events/event-gantt-chart'
import { EventGridItem } from '@/components/events/event-grid-item'
import { EventStatusFilter } from '@/components/events/event-status-filter'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
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
  const [viewMode, setViewMode] = useAtom(eventViewModeAtom)
  const [statusFilter, _setStatusFilter] = useAtom(eventListStatusFilterAtom)  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
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

        // ステータスを計算
        const status = (() => {
          if (event.endedAt != null) return 'ended'
          if (endDate && currentTime.isAfter(endDate)) return 'ended'
          if (currentTime.isBefore(startDate)) return 'upcoming'
          return 'ongoing'
        })()

        // ステータスフィルタを適用
        if (!statusFilter[status]) return false

        // 終了後1週間経過したイベントは非表示
        if (endDate?.add(7, 'day').isBefore(currentTime)) {
          return false
        }

        return true
      })
      .sort((a, b) => dayjs(a.startDate).valueOf() - dayjs(b.startDate).valueOf())
  }, [events, categoryFilter, regionFilter, storePrefectureMap, statusFilter])

  return (
    <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-6xl'>
      <div className='flex flex-col gap-2'>
        {/* カテゴリフィルターとボタン */}
        <div className='flex items-start justify-between gap-4'>
          <div className='flex-1'>
            <EventCategoryFilter />
          </div>
          <div className='flex items-center gap-2 shrink-0'>
            {/* モバイル: フィルターボタン */}
            <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
              <SheetTrigger asChild>
                <Button size='sm' variant='outline' className='gap-2 md:hidden'>
                  <Filter className='size-4' />
                  フィルター
                </Button>
              </SheetTrigger>
              <SheetContent side='bottom' className='h-[90vh]'>
                <SheetHeader>
                  <SheetTitle>フィルター</SheetTitle>
                </SheetHeader>
                <div className='mt-6 space-y-6 overflow-y-auto h-[calc(90vh-80px)] pb-6'>
                  {/* 種別フィルター */}
                  <EventCategoryFilter />
                  
                  {/* 地域フィルター */}
                  <RegionFilterControl />
                  
                  {/* ステータスフィルタ */}
                  <div className='w-full'>
                    <FilterHeader label='開催状況で絞り込み' />
                    <EventStatusFilter statusFilterAtom={eventListStatusFilterAtom} />
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            {/* 表示切り替えボタン */}
            <div className='flex items-center gap-1 bg-gray-100 rounded-lg p-1'>
              <Button
                size='sm'
                variant='ghost'
                className={`h-7 w-7 p-0 ${viewMode === 'gantt' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:bg-gray-200'}`}
                onClick={() => setViewMode('gantt')}
              >
                <Calendar className='size-4' />
              </Button>
              <Button
                size='sm'
                variant='ghost'
                className={`h-7 w-7 p-0 ${viewMode === 'grid' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:bg-gray-200'}`}
                onClick={() => setViewMode('grid')}
              >
                <LayoutGrid className='size-4' />
              </Button>
            </div>
            <Button asChild size='sm' variant='ghost' className='gap-2 text-gray-600 hover:text-gray-900'>
              <Link to='/admin/events'>
                <Settings className='size-4' />
                管理
              </Link>
            </Button>
          </div>
        </div>

        {/* デスクトップ: インラインフィルター */}
        <div className='hidden md:flex md:flex-col md:gap-2'>
          {/* 地域フィルター */}
          <RegionFilterControl />

          {/* ステータスフィルタ */}
          <div className='w-full'>
            <FilterHeader label='開催状況で絞り込み' />
            <EventStatusFilter statusFilterAtom={eventListStatusFilterAtom} />
          </div>
        </div>

        {/* イベント表示 */}
        {activeEvents.length > 0 ? (
          viewMode === 'gantt' ? (
            <EventGanttChart events={activeEvents} />
          ) : (
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
              {activeEvents.map((event, index) => (
                <EventGridItem key={event.id} event={event} index={index} />
              ))}
            </div>
          )
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
