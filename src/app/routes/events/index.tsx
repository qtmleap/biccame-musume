import { useSuspenseQueries } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { useAtom } from 'jotai'
import { Calendar, Filter, Gift, LayoutGrid, X } from 'lucide-react'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { categoryFilterAtom } from '@/atoms/category-filter-atom'
import { eventListStatusFilterAtom } from '@/atoms/event-list-status-filter-atom'
import { eventListStoreFilterAtom } from '@/atoms/event-list-store-filter-atom'
import { eventPageAtom } from '@/atoms/event-page-atom'
import { eventUserActivityFilterAtom } from '@/atoms/event-user-activity-filter-atom'
import { eventViewModeAtom } from '@/atoms/event-view-mode-atom'
import { prefectureToRegion, regionFilterAtom } from '@/atoms/filter-atom'
import { RegionFilterControl } from '@/components/characters/region-filter-control'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { EventCategoryFilter } from '@/components/events/event-category-filter'
import { EventGanttChart } from '@/components/events/event-gantt-chart'
import { EventStatusFilter } from '@/components/events/event-status-filter'
import { EventStoreFilter } from '@/components/events/event-store-filter'
import { EventUserActivityFilter } from '@/components/events/event-user-activity-filter'
import { PaginatedEventGrid } from '@/components/events/paginated-event-grid'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Toggle } from '@/components/ui/toggle'
import { charactersQueryKey } from '@/hooks/use-characters'
import { useUserActivity } from '@/hooks/use-user-activity'
import { client } from '@/utils/client'

const PER_PAGE = 12

/**
 * イベント一覧のコンテンツ
 */
const EventsContent = () => {
  const { store: storeParam } = Route.useSearch()
  const navigate = Route.useNavigate()
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

  const [categoryFilter, setCategoryFilter] = useAtom(categoryFilterAtom)
  const [regionFilter, setRegionFilter] = useAtom(regionFilterAtom)
  const [viewMode, setViewMode] = useAtom(eventViewModeAtom)
  const [statusFilter, setStatusFilter] = useAtom(eventListStatusFilterAtom)
  const [activityFilter, setActivityFilter] = useAtom(eventUserActivityFilterAtom)
  const [storeFilter, setStoreFilter] = useAtom(eventListStoreFilterAtom)
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)

  // URLの store パラメータをatomに同期
  useEffect(() => {
    setStoreFilter(storeParam ?? null)
  }, [storeParam, setStoreFilter])

  // atom の変更をURLに反映（共有・履歴対応）
  useEffect(() => {
    const next = storeFilter ?? undefined
    if (next === storeParam) return
    navigate({ search: (prev) => ({ ...prev, store: next }), replace: true })
  }, [storeFilter, storeParam, navigate])

  const DEFAULT_CATEGORY = new Set(['ackey', 'limited_card', 'regular_card', 'other'] as const)
  const DEFAULT_STATUS = { upcoming: true, ongoing: true, ended: false }
  const DEFAULT_ACTIVITY = { hideInterested: false, hideCompleted: false }
  const DEFAULT_REGION = 'all' as const

  const isFilterActive =
    regionFilter !== DEFAULT_REGION ||
    statusFilter.upcoming !== DEFAULT_STATUS.upcoming ||
    statusFilter.ongoing !== DEFAULT_STATUS.ongoing ||
    statusFilter.ended !== DEFAULT_STATUS.ended ||
    activityFilter.hideInterested !== DEFAULT_ACTIVITY.hideInterested ||
    activityFilter.hideCompleted !== DEFAULT_ACTIVITY.hideCompleted ||
    categoryFilter.size !== DEFAULT_CATEGORY.size ||
    [...DEFAULT_CATEGORY].some((c) => !categoryFilter.has(c)) ||
    storeFilter !== null

  const handleResetFilters = () => {
    setCategoryFilter(new Set(['ackey', 'limited_card', 'regular_card', 'other']))
    setRegionFilter(DEFAULT_REGION)
    setStatusFilter(DEFAULT_STATUS)
    setActivityFilter(DEFAULT_ACTIVITY)
    setStoreFilter(null)
  }
  const [page, setPage] = useAtom(eventPageAtom)
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

        // 店舗フィルター
        if (storeFilter !== null) {
          if (!event.stores?.includes(storeFilter as never)) return false
        }

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

        return true
      })
      .sort((a, b) => dayjs(a.startDate).valueOf() - dayjs(b.startDate).valueOf())
  }, [
    events,
    categoryFilter,
    storeFilter,
    regionFilter,
    storePrefectureMap,
    statusFilter,
    activityFilter,
    interestedEvents,
    completedEvents
  ])

  // フィルター変更時にページを1にリセット
  // biome-ignore lint/correctness/useExhaustiveDependencies: filter vars are watched intentionally to trigger page reset
  useEffect(() => {
    setPage(1)
  }, [setPage, categoryFilter, storeFilter, regionFilter, statusFilter, activityFilter])

  return (
    <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-6xl'>
      <div className='flex flex-col gap-2'>
        {/* ヘッダーとボタン群 */}
        <div className='flex items-center justify-between gap-4'>
          <h1 className='text-2xl font-bold text-foreground'>イベント一覧</h1>
          <div className='flex items-center gap-2'>
            {/* モバイル: フィルターボタン */}
            <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
              <SheetTrigger asChild>
                <Button
                  size='sm'
                  variant='ghost'
                  className='md:hidden relative h-9 w-9 p-0 text-muted-foreground hover:text-foreground'
                >
                  <Filter className='size-4' />
                  {isFilterActive && (
                    <span className='absolute top-0.5 right-0.5 size-2 rounded-full bg-brand' aria-hidden />
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side='bottom' className='h-auto max-h-[85vh] flex flex-col'>
                <SheetHeader>
                  <SheetTitle>フィルター</SheetTitle>
                  <SheetDescription>イベントの絞り込み条件を選択してください</SheetDescription>
                </SheetHeader>
                <div className='flex-1 overflow-y-auto px-4'>
                  <div className='space-y-6 pb-4'>
                    <EventCategoryFilter />
                    <EventStatusFilter statusFilterAtom={eventListStatusFilterAtom} />
                    <EventUserActivityFilter />
                    <RegionFilterControl />
                    <EventStoreFilter storeFilterAtom={eventListStoreFilterAtom} />
                  </div>
                </div>
                <div className='border-t border-card px-4 py-3'>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={handleResetFilters}
                    disabled={!isFilterActive}
                    aria-label='フィルターをクリア'
                    className='w-full gap-1'
                  >
                    <X className='size-4' />
                    フィルターをクリア
                  </Button>
                </div>
              </SheetContent>
            </Sheet>

            {/* 表示切り替えボタン */}
            <Toggle
              size='sm'
              pressed={viewMode === 'grid'}
              onPressedChange={(pressed) => setViewMode(pressed ? 'grid' : 'gantt')}
              className='h-9 w-9 p-0 text-muted-foreground hover:text-foreground'
            >
              {viewMode === 'grid' ? <LayoutGrid className='size-4' /> : <Calendar className='size-4' />}
            </Toggle>
          </div>
        </div>

        {/* デスクトップ: インラインフィルター */}
        <div className='hidden md:flex md:flex-col md:gap-2'>
          {/* 種別フィルターと店舗フィルター */}
          <div className='flex items-start gap-4'>
            <div className='flex-1'>
              <EventCategoryFilter />
            </div>
            <div className='w-64 shrink-0'>
              <EventStoreFilter storeFilterAtom={eventListStoreFilterAtom} />
            </div>
          </div>

          {/* ステータスフィルタとマイアクティビティフィルタ */}
          <div className='flex items-center gap-4'>
            <EventStatusFilter statusFilterAtom={eventListStatusFilterAtom} />
            <EventUserActivityFilter />
            <Toggle
              size='sm'
              pressed={false}
              onPressedChange={() => handleResetFilters()}
              disabled={!isFilterActive}
              aria-label='フィルターをクリア'
              title='フィルターをクリア'
              className='ml-auto h-8 w-8 p-0 text-muted-foreground hover:text-foreground data-[state=on]:text-foreground'
            >
              <X className='size-4' />
            </Toggle>
          </div>

          {/* 地域フィルター */}
          <RegionFilterControl />
        </div>

        {/* イベント表示 */}
        {viewMode === 'gantt' ? (
          <EventGanttChart events={activeEvents} />
        ) : (
          <PaginatedEventGrid
            events={activeEvents}
            perPage={PER_PAGE}
            page={page}
            onPageChange={setPage}
            emptyState={
              <div className='text-center py-12 text-muted-foreground'>
                <Gift className='size-12 mx-auto mb-4 opacity-30' />
                <p>開催中・開催予定のイベントはありません</p>
              </div>
            }
          />
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
  validateSearch: z.object({
    store: z.string().optional()
  }),
  component: EventsPage
})
