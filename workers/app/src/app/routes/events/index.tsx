import { useSuspenseQueries } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { useAtom } from 'jotai'
import { Calendar, Filter, Gift, LayoutGrid, X } from 'lucide-react'
import { Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { eventListFiltersAtom } from '@/atoms/event-list-filters-atom'
import { eventViewModeAtom } from '@/atoms/event-view-mode-atom'
import { prefectureToRegion } from '@/atoms/filter-atom'
import { RegionFilterControl } from '@/components/characters/region-filter-control'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { EventAgeFilter } from '@/components/events/event-age-filter'
import { EventCategoryFilter } from '@/components/events/event-category-filter'
import { EventGanttChart } from '@/components/events/event-gantt-chart'
import { EventGroupBanner } from '@/components/events/event-group-banner'
import { EventStatusFilter } from '@/components/events/event-status-filter'
import { EventStoreFilter } from '@/components/events/event-store-filter'
import { EventUserActivityFilter } from '@/components/events/event-user-activity-filter'
import { PaginatedEventGrid } from '@/components/events/paginated-event-grid'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Toggle } from '@/components/ui/toggle'
import { useAuth } from '@/hooks/use-auth'
import { charactersQueryKey } from '@/hooks/use-characters'
import { useJstDate } from '@/hooks/use-jst-date'
import { useUserActivity } from '@/hooks/use-user-activity'
import { EVENT_CATEGORY_LABELS, EVENT_STATUS_LABELS, REGION_LABELS, STORE_NAME_LABELS } from '@/locales/app.content'
import { EventCategorySchema } from '@/schemas/event.dto'
import {
  DEFAULT_EVENT_LIST_FILTERS,
  EVENT_FILTER_STATUSES,
  type EventListFilters,
  EventSearchSchema
} from '@/schemas/event-search'
import { StoreKeySchema } from '@/schemas/store.dto'
import { client } from '@/utils/client'
import {
  hasEventListFilterParams,
  resolveEventListFilters,
  shouldNormalizeEventListSearch,
  toEventListFilterSearch,
  toStoredEventListFilters
} from '@/utils/event-list-filters'
import { calculateEventStatus, hasEventStartedOneMonthAgo } from '@/utils/event-status'

const PER_PAGE = 12
const desktopQuery = '(min-width: 768px)'
const subscribeViewport = (onChange: () => void) => {
  const media = window.matchMedia(desktopQuery)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}
const isDesktopViewport = () => window.matchMedia(desktopQuery).matches

/**
 * イベント一覧のコンテンツ
 */
const EventsContent = () => {
  const search = Route.useSearch()
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

  const dateKey = useJstDate()
  const events = eventsQuery.data
  const characters = charactersQuery.data

  const [savedViewMode, setViewMode] = useAtom(eventViewModeAtom)
  const isDesktop = useSyncExternalStore(subscribeViewport, isDesktopViewport, () => true)
  const viewMode = savedViewMode === null ? (isDesktop ? 'gantt' : 'grid') : savedViewMode
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  // 絞り込みは「URL に絞り込みのパラメータが 1 つでもあれば URL の値だけ、無ければ保存値をまるごと」使う。
  // 未ログインでは非表示設定を出さないので、保存値の非表示設定も効かせない。
  const [storedFilters, setStoredFilters] = useAtom(eventListFiltersAtom)
  const { isAuthenticated } = useAuth()
  const filters = useMemo(
    () => resolveEventListFilters(search, storedFilters, isAuthenticated),
    [search, storedFilters, isAuthenticated]
  )
  const categoryFilter = useMemo(
    () => new Set(EventCategorySchema.options.filter((category) => filters.category.split(',').includes(category))),
    [filters.category]
  )
  const regionFilter = filters.region
  const statusFilter = useMemo(
    () => ({
      upcoming: filters.status.split(',').includes('upcoming'),
      ongoing: filters.status.split(',').includes('ongoing'),
      ended: filters.status.split(',').includes('ended')
    }),
    [filters.status]
  )
  const activityFilter = useMemo(
    () => ({ hideInterested: filters.hideInterested, hideCompleted: filters.hideCompleted }),
    [filters.hideInterested, filters.hideCompleted]
  )
  const storeFilter = filters.store === undefined ? null : filters.store
  const hideOldEvents = filters.hideOldEvents
  const page = search.page

  // 変更後の絞り込み全体を保存と URL の両方へ反映する(次回の復元と URL 共有のため)。
  // URL に一部だけ書くと、書かれなかった項目が既定へ戻ってしまうので、常に全項目を書く。ページは 1 に戻す。
  const updateFilters = (patch: Partial<EventListFilters>) => {
    const next = { ...filters, ...patch }
    setStoredFilters(toStoredEventListFilters(next, storedFilters, isAuthenticated))
    navigate({ search: (prev) => ({ ...prev, ...toEventListFilterSearch(next, isAuthenticated), page: 1 }) })
  }
  const setCategoryFilter = (value: typeof categoryFilter) => updateFilters({ category: [...value].join(',') })
  const setRegionFilter = (region: typeof regionFilter) => updateFilters({ region })
  const setStatusFilter = (value: typeof statusFilter) => {
    updateFilters({ status: EVENT_FILTER_STATUSES.filter((status) => value[status]).join(',') })
  }
  const setActivityFilter = (value: typeof activityFilter) => updateFilters(value)
  const setStoreFilter = (store: string | null) => {
    const result = StoreKeySchema.safeParse(store)
    updateFilters({ store: result.success ? result.data : undefined })
  }
  const setPage = useCallback(
    (next: number) => {
      navigate({ search: (prev) => ({ ...prev, page: next }) })
    },
    [navigate]
  )
  const isFilterActive =
    regionFilter !== 'all' ||
    EVENT_FILTER_STATUSES.some((status) => statusFilter[status] !== (status !== 'ended')) ||
    activityFilter.hideInterested ||
    activityFilter.hideCompleted ||
    !hideOldEvents ||
    categoryFilter.size !== EventCategorySchema.options.length ||
    storeFilter !== null

  // クリアは保存値も既定に戻す。URL の非表示設定は未ログインでも既定(false)で上書きする。
  const handleResetFilters = () => {
    setStoredFilters(DEFAULT_EVENT_LIST_FILTERS)
    navigate({ search: (prev) => ({ ...prev, ...toEventListFilterSearch(DEFAULT_EVENT_LIST_FILTERS, true), page: 1 }) })
  }
  // URL に絞り込みが無いまま開かれたら、実際に使っている絞り込み(保存値または既定)を URL に書き込む。
  // 共有した URL が見えている絞り込みを再現できるようにするため。履歴は増やさない。
  const shouldNormalize = shouldNormalizeEventListSearch(search, storedFilters, isAuthenticated)
  useEffect(() => {
    if (!shouldNormalize) return
    navigate({
      search: (prev) =>
        hasEventListFilterParams(prev) ? prev : { ...prev, ...toEventListFilterSearch(filters, isAuthenticated) },
      replace: true
    })
  }, [shouldNormalize, filters, isAuthenticated, navigate])
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
    return events
      .map((event) => ({ ...event, ...calculateEventStatus(event, `${dateKey}T00:00:00+09:00`) }))
      .filter((event) => {
        if (hideOldEvents && hasEventStartedOneMonthAgo(event.startDate, dateKey)) return false
        // カテゴリフィルター
        if (!categoryFilter.has(event.category)) return false

        // 店舗フィルター
        if (storeFilter !== null) {
          if (!event.stores?.includes(storeFilter)) return false
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

        // ステータスフィルタを適用（当日のlast_dayはongoingとして扱う）
        const filterStatus = event.status === 'last_day' ? 'ongoing' : event.status
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
    dateKey,
    hideOldEvents,
    categoryFilter,
    storeFilter,
    regionFilter,
    storePrefectureMap,
    statusFilter,
    activityFilter,
    interestedEvents,
    completedEvents
  ])

  const filterSummary = [
    categoryFilter.size === EventCategorySchema.options.length
      ? 'すべての種別'
      : categoryFilter.size === 0
        ? '種別の選択なし'
        : [...categoryFilter].map((category) => EVENT_CATEGORY_LABELS[category]).join('・'),
    EVENT_FILTER_STATUSES.filter((status) => statusFilter[status])
      .map((status) => EVENT_STATUS_LABELS[status])
      .join('・') || '開催状況の選択なし',
    REGION_LABELS[regionFilter],
    storeFilter === null ? 'すべての店舗' : STORE_NAME_LABELS[storeFilter],
    activityFilter.hideInterested ? '興味ありを非表示' : null,
    activityFilter.hideCompleted ? '達成済みを非表示' : null,
    hideOldEvents ? '開始から1か月以上を非表示' : null
  ]
    .filter(Boolean)
    .join(' / ')

  const totalPages = Math.max(1, Math.ceil(activeEvents.length / PER_PAGE))
  const effectivePage = Math.min(Math.max(1, page), totalPages)
  useEffect(() => {
    // 再取得で件数だけが減った場合は、現在ページを最後の有効ページへ補正する。
    if (page !== effectivePage) {
      navigate({ search: (prev) => ({ ...prev, page: Math.min(prev.page, totalPages) }), replace: true })
    }
  }, [page, effectivePage, totalPages, navigate])

  return (
    <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-6xl text-foreground'>
      <EventGroupBanner />
      <div className='flex flex-col gap-2 mt-3'>
        {/* ヘッダーとボタン群 */}
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <h1 className='text-2xl font-bold text-foreground'>イベント一覧</h1>
          <div className='flex items-center gap-2'>
            {/* モバイル: フィルターボタン */}
            <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
              <SheetTrigger asChild>
                <Button
                  size='sm'
                  variant='ghost'
                  aria-label='イベントを絞り込む'
                  className='md:hidden relative h-9 w-9 p-0 text-muted-foreground hover:text-foreground'
                >
                  <Filter className='size-4' />
                  {isFilterActive && (
                    <span className='absolute top-0.5 right-0.5 size-2 rounded-full bg-brand' aria-hidden />
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent
                side='bottom'
                className='h-auto max-h-[85dvh] flex flex-col text-foreground [&_label]:text-foreground'
              >
                <SheetHeader className='shrink-0'>
                  <SheetTitle>フィルター</SheetTitle>
                  <SheetDescription>イベントの絞り込み条件を選択してください</SheetDescription>
                </SheetHeader>
                <div className='min-h-0 flex-1 overflow-y-auto px-4'>
                  <div className='space-y-6 pb-4'>
                    <EventCategoryFilter value={categoryFilter} onChange={setCategoryFilter} />
                    <EventStatusFilter value={statusFilter} onChange={setStatusFilter} />
                    <EventUserActivityFilter value={activityFilter} onChange={setActivityFilter} />
                    <RegionFilterControl value={regionFilter} onChange={setRegionFilter} />
                    <EventStoreFilter value={storeFilter} onChange={setStoreFilter} />
                    <EventAgeFilter
                      value={hideOldEvents}
                      onChange={(value) => updateFilters({ hideOldEvents: value })}
                    />
                  </div>
                </div>
                <div className='shrink-0 border-t border-card-border bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-2'>
                  <p role='status' className='text-sm'>
                    <span className='font-semibold'>{activeEvents.length}件</span>
                    <span className='block text-foreground'>{filterSummary}</span>
                  </p>
                  <Button className='w-full' onClick={() => setFilterSheetOpen(false)}>
                    {activeEvents.length}件を表示
                  </Button>
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

            {/* 表示選択は画面幅が変わっても維持する。 */}
            <fieldset className='flex gap-1 text-foreground' aria-label='イベントの表示方法'>
              <Button
                size='sm'
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                aria-pressed={viewMode === 'grid'}
                onClick={() => setViewMode('grid')}
                className='h-9 gap-1 px-2'
              >
                <LayoutGrid className='size-4' aria-hidden />
                一覧
              </Button>
              <Button
                size='sm'
                variant={viewMode === 'gantt' ? 'secondary' : 'ghost'}
                aria-pressed={viewMode === 'gantt'}
                onClick={() => setViewMode('gantt')}
                className='h-9 gap-1 px-2'
              >
                <Calendar className='size-4' aria-hidden />
                日程
              </Button>
            </fieldset>
          </div>
        </div>

        {/* デスクトップ: インラインフィルター */}
        <div className='hidden md:flex md:flex-col md:gap-2 [&_label]:text-foreground'>
          {/* 種別フィルターと店舗フィルター */}
          <div className='flex items-start gap-4'>
            <div className='flex-1'>
              <EventCategoryFilter value={categoryFilter} onChange={setCategoryFilter} />
            </div>
            <div className='w-64 shrink-0'>
              <EventStoreFilter value={storeFilter} onChange={setStoreFilter} />
            </div>
          </div>

          {/* ステータスフィルタとマイアクティビティフィルタ */}
          <div className='flex items-center gap-4'>
            <EventStatusFilter value={statusFilter} onChange={setStatusFilter} />
            <EventUserActivityFilter value={activityFilter} onChange={setActivityFilter} />
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
          <RegionFilterControl value={regionFilter} onChange={setRegionFilter} />
          <EventAgeFilter value={hideOldEvents} onChange={(value) => updateFilters({ hideOldEvents: value })} />
        </div>

        <p role='status' className='text-sm text-foreground'>
          <span className='font-semibold'>{activeEvents.length}件</span>
          <span className='block text-foreground'>適用中: {filterSummary}</span>
        </p>

        {/* イベント表示 */}
        {activeEvents.length === 0 ? (
          <div className='text-center py-12 text-muted-foreground'>
            <Gift className='size-12 mx-auto mb-4 opacity-30' />
            <p>条件に一致するイベントはありません</p>
            <Button variant='outline' className='mt-4' onClick={handleResetFilters}>
              条件を解除
            </Button>
          </div>
        ) : viewMode === 'gantt' ? (
          <EventGanttChart events={activeEvents} />
        ) : (
          <PaginatedEventGrid events={activeEvents} perPage={PER_PAGE} page={effectivePage} onPageChange={setPage} />
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
  validateSearch: EventSearchSchema,
  component: EventsPage
})
