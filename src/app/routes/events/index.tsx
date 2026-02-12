import { useSuspenseQueries } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { useAtom, useAtomValue } from 'jotai'
import { Calendar, EyeOff, Gift, LayoutGrid, Settings } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import { Suspense, useMemo, useState } from 'react'
import { categoryFilterAtom } from '@/atoms/category-filter-atom'
import { eventListStatusFilterAtom } from '@/atoms/event-list-status-filter-atom'
import { eventUserActivityFilterAtom } from '@/atoms/event-user-activity-filter-atom'
import { eventViewModeAtom } from '@/atoms/event-view-mode-atom'
import { prefectureToRegion, regionFilterAtom } from '@/atoms/filter-atom'
import { RegionFilterControl } from '@/components/characters/region-filter-control'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { EventCategoryFilter } from '@/components/events/event-category-filter'
import { EventGanttChart } from '@/components/events/event-gantt-chart'
import { EventGridItem } from '@/components/events/event-grid-item'
import { EventStatusFilter } from '@/components/events/event-status-filter'
import { EventUserActivityFilter } from '@/components/events/event-user-activity-filter'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Toggle } from '@/components/ui/toggle'
import { charactersQueryKey } from '@/hooks/use-characters'
import { useUserActivity } from '@/hooks/use-user-activity'
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
  const [statusFilter] = useAtom(eventListStatusFilterAtom)
  const [activityFilter] = useAtom(eventUserActivityFilterAtom)
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const { interestedEvents, completedEvents } = useUserActivity()
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

        // ステータスフィルタを適用（last_dayはongoingとして扱う）
        const filterStatus = event.status === 'last_day' ? 'ongoing' : status
        if (!statusFilter[filterStatus]) return false

        // ユーザーアクティビティフィルタを適用（選択されているものを非表示）
        const isInterested = interestedEvents.includes(event.uuid)
        const isCompleted = completedEvents.includes(event.uuid)

        if (isInterested && activityFilter.hideInterested) return false
        if (isCompleted && activityFilter.hideCompleted) return false

        // 終了後1週間経過したイベントは非表示
        if (endDate?.add(7, 'day').isBefore(currentTime)) {
          return false
        }

        return true
      })
      .sort((a, b) => dayjs(a.startDate).valueOf() - dayjs(b.startDate).valueOf())
  }, [
    events,
    categoryFilter,
    regionFilter,
    storePrefectureMap,
    statusFilter,
    activityFilter,
    interestedEvents,
    completedEvents
  ])

  return (
    <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-6xl'>
      <div className='flex flex-col gap-2'>
        {/* ヘッダーとボタン群 */}
        <div className='flex items-center justify-between gap-4'>
          <h1 className='text-2xl font-bold text-gray-900'>イベント一覧</h1>
          <div className='flex items-center gap-2'>
            {/* モバイル: フィルターボタン */}
            <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
              <SheetTrigger asChild>
                <Button size='sm' variant='ghost' className='md:hidden h-8 w-8 p-0'>
                  <EyeOff className='size-4' />
                </Button>
              </SheetTrigger>
              <SheetContent side='bottom' className='h-[55vh]'>
                <SheetHeader>
                  <SheetTitle>フィルター</SheetTitle>
                  <SheetDescription>イベントの絞り込み条件を選択してください</SheetDescription>
                </SheetHeader>
                <div className='px-4'>
                  <div className='space-y-6 overflow-y-auto h-[calc(90vh-72px)] pb-6'>
                    {/* 種別フィルター */}
                    <EventCategoryFilter />

                    {/* ステータスフィルタ */}
                    <EventStatusFilter statusFilterAtom={eventListStatusFilterAtom} />

                    {/* ユーザーアクティビティフィルタ */}
                    <EventUserActivityFilter />

                    {/* 地域フィルター */}
                    <RegionFilterControl />
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            {/* 表示切り替えボタン */}
            <Toggle
              size='sm'
              pressed={viewMode === 'grid'}
              onPressedChange={(pressed) => setViewMode(pressed ? 'grid' : 'gantt')}
              className='h-8 w-8 p-0 text-gray-600 hover:text-gray-900 data-[state=on]:text-gray-900'
            >
              {viewMode === 'grid' ? <LayoutGrid className='size-4' /> : <Calendar className='size-4' />}
            </Toggle>
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
          {/* 種別フィルター */}
          <EventCategoryFilter />

          {/* ステータスフィルタとマイアクティビティフィルタ */}
          <div className='flex gap-4'>
            <EventStatusFilter statusFilterAtom={eventListStatusFilterAtom} />
            <EventUserActivityFilter />
          </div>

          {/* 地域フィルター */}
          <RegionFilterControl />
        </div>

        {/* イベント表示 */}
        {viewMode === 'gantt' ? (
          <EventGanttChart events={activeEvents} />
        ) : activeEvents.length > 0 ? (
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
            <AnimatePresence mode='popLayout'>
              {activeEvents.map((event) => (
                <EventGridItem key={event.uuid} event={event} />
              ))}
            </AnimatePresence>
          </div>
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
