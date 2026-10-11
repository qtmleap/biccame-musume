import { calculateEventStatus, hasEventStartedOneMonthAgo } from '@biccame/shared/domain/event-status'
import { prefectureToRegion } from '@biccame/shared/domain/regions'
import { EventCategorySchema } from '@biccame/shared/schemas/event.dto'
import { StoreKeySchema } from '@biccame/shared/schemas/store.dto'
import { useSuspenseQueries } from '@tanstack/react-query'
import { createFileRoute, useLocation } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { useAtom } from 'jotai'
import { Calendar, Filter, Gift, LayoutGrid } from 'lucide-react'
import { ToggleGroup } from 'radix-ui'
import { Suspense, useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import { eventListFiltersAtom } from '@/atoms/event-list-filters-atom'
import { eventViewModeAtom } from '@/atoms/event-view-mode-atom'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { toggleVariants } from '@/components/ui/toggle'
import { useAuth } from '@/hooks/use-auth'
import { charactersQueryKey } from '@/hooks/use-characters'
import { useJstDate } from '@/hooks/use-jst-date'
import { useUserActivity } from '@/hooks/use-user-activity'
import { cn } from '@/lib/utils'
import {
  DEFAULT_EVENT_LIST_FILTERS,
  EVENT_FILTER_STATUSES,
  type EventListFilters,
  EventSearchSchema
} from '@/schemas/event-search'
import { client } from '@/utils/client'
import {
  parseEventListFilterSearch,
  parseEventPage,
  resolveEventListFilters,
  toStoredEventListFilters
} from '@/utils/event-list-filters'

const PER_PAGE = 12
const viewModeItemClassName = cn(
  toggleVariants({ size: 'sm' }),
  'h-full gap-1 rounded-none px-2 first:rounded-l-md last:rounded-r-md text-foreground hover:bg-brand/10 hover:text-foreground data-[state=on]:bg-brand/20 data-[state=on]:text-foreground'
)
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
  const entryKey = useLocation({ select: (location) => location.state.__TSR_key })
  const [entryState, setEntryState] = useState<{
    key: typeof entryKey
    edited: boolean
    page: number | undefined
  }>({ key: entryKey, edited: false, page: undefined })
  // 戻る・進むを含む新しい履歴エントリーでは URL の条件を改めて読む。
  if (entryState.key !== entryKey) setEntryState({ key: entryKey, edited: false, page: undefined })
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
  const [filterDialogOpen, setFilterDialogOpen] = useState(false)
  // 入場時は URL に条件があればその値を使い、無ければ現在の保存値を使う。
  // このエントリーで条件を操作した後は保存値を使い、元の URL は一切書き換えない。
  // 未ログインでは、保存値の非表示設定は効かせない。
  const [storedFilters, setStoredFilters] = useAtom(eventListFiltersAtom)
  const { isAuthenticated } = useAuth()
  const urlFilters = useMemo(() => parseEventListFilterSearch(search), [search])
  const preferStored = entryState.key === entryKey && entryState.edited
  const filters = useMemo(
    () => resolveEventListFilters(urlFilters, storedFilters, isAuthenticated, preferStored),
    [urlFilters, storedFilters, isAuthenticated, preferStored]
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
  // 条件操作によるページリセットは画面内だけで行い、URL の page はそのまま残す。
  const page =
    entryState.key === entryKey && entryState.page !== undefined ? entryState.page : parseEventPage(search.page)

  const updateFilters = (patch: Partial<EventListFilters>) => {
    const next = { ...filters, ...patch }
    setStoredFilters(toStoredEventListFilters(next, storedFilters, isAuthenticated))
    setEntryState({ key: entryKey, edited: true, page: 1 })
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
      // 編集後のページ送りも画面内で行い、古い URL 条件を再適用しない。
      if (preferStored) {
        setEntryState({ key: entryKey, edited: true, page: next })
        return
      }
      navigate({ search: (prev) => ({ ...prev, page: next }) })
    },
    [navigate, preferStored, entryKey]
  )
  const isFilterActive =
    regionFilter !== 'all' ||
    EVENT_FILTER_STATUSES.some((status) => statusFilter[status] !== (status !== 'ended')) ||
    activityFilter.hideInterested ||
    activityFilter.hideCompleted ||
    !hideOldEvents ||
    categoryFilter.size !== EventCategorySchema.options.length ||
    storeFilter !== null

  // クリアも保存値と画面だけを既定へ戻す。URL は変更しない。
  const handleResetFilters = () => {
    setStoredFilters(DEFAULT_EVENT_LIST_FILTERS)
    setEntryState({ key: entryKey, edited: true, page: 1 })
  }
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

  const totalPages = Math.max(1, Math.ceil(activeEvents.length / PER_PAGE))
  const effectivePage = page === undefined ? 1 : Math.min(page, totalPages)

  return (
    <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-6xl text-foreground'>
      <EventGroupBanner />
      <div className='flex flex-col gap-2 mt-3'>
        {/* ヘッダーとボタン群 */}
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <h1 className='text-2xl font-bold text-foreground'>イベント一覧</h1>
          <div className='flex items-center gap-2'>
            {/* 条件の変更は画面幅にかかわらず同じダイアログで行う。 */}
            <Dialog open={filterDialogOpen} onOpenChange={setFilterDialogOpen}>
              <DialogTrigger asChild>
                <Button size='sm' variant='outline' aria-label='イベントを絞り込む' className='relative h-9 gap-1 px-2'>
                  <Filter className='size-4' aria-hidden />
                  条件を変更
                  {isFilterActive && (
                    <span className='absolute top-0.5 right-0.5 size-2 rounded-full bg-brand' aria-hidden />
                  )}
                </Button>
              </DialogTrigger>
              <DialogContent className='max-h-[85dvh] flex flex-col gap-0 overflow-hidden border-border p-0 text-foreground [&_label]:text-foreground'>
                <DialogHeader className='shrink-0 p-4 pr-10 text-left'>
                  <DialogTitle>フィルター</DialogTitle>
                  <DialogDescription>イベントの絞り込み条件を選択してください</DialogDescription>
                </DialogHeader>
                <div data-testid='event-filter-conditions' className='min-h-0 flex-1 overflow-y-auto px-4'>
                  <div className='space-y-6 pb-4'>
                    <EventCategoryFilter value={categoryFilter} onChange={setCategoryFilter} />
                    <EventStatusFilter value={statusFilter} onChange={setStatusFilter} />
                    <EventUserActivityFilter value={activityFilter} onChange={setActivityFilter} />
                    <RegionFilterControl value={regionFilter} onChange={setRegionFilter} />
                    <EventAgeFilter
                      value={hideOldEvents}
                      onChange={(value) => updateFilters({ hideOldEvents: value })}
                    />
                  </div>
                </div>
                <div
                  data-testid='event-filter-actions'
                  className='grid grid-cols-2 shrink-0 items-center gap-2 border-t border-card-border bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]'
                >
                  <Button
                    className='w-full min-w-0 h-9 bg-brand hover:bg-brand/90 text-brand-foreground'
                    onClick={() => setFilterDialogOpen(false)}
                  >
                    適用
                  </Button>
                  <Button
                    variant='outline'
                    onClick={handleResetFilters}
                    disabled={!isFilterActive}
                    aria-label='クリア'
                    className='w-full min-w-0 h-9'
                  >
                    クリア
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* 表示選択は画面幅が変わっても維持する。 */}
            <ToggleGroup.Root
              type='single'
              orientation='horizontal'
              role='radiogroup'
              aria-label='イベントの表示方法'
              value={viewMode}
              onValueChange={(value) => {
                if (value === 'grid' || value === 'gantt') setViewMode(value)
              }}
              className='inline-flex h-9 items-center rounded-md bg-button-surface text-foreground'
              style={{ outline: '1.5px solid var(--card-border)', outlineOffset: '-1.5px' }}
            >
              {/* 選択済み項目の押し直しも、明示的な表示選択として保存する。 */}
              <ToggleGroup.Item value='grid' onClick={() => setViewMode('grid')} className={viewModeItemClassName}>
                <LayoutGrid className='size-4' aria-hidden />
                一覧
              </ToggleGroup.Item>
              <ToggleGroup.Item value='gantt' onClick={() => setViewMode('gantt')} className={viewModeItemClassName}>
                <Calendar className='size-4' aria-hidden />
                日程
              </ToggleGroup.Item>
            </ToggleGroup.Root>
          </div>
        </div>

        <div data-testid='event-store-toolbar' className='w-full md:w-64'>
          <EventStoreFilter value={storeFilter} onChange={setStoreFilter} />
        </div>

        {/* イベント表示 */}
        {activeEvents.length === 0 ? (
          <div className='text-center py-12 text-muted-foreground'>
            <Gift className='size-12 mx-auto mb-4 opacity-30' />
            <p>条件に一致するイベントはありません</p>
            <Button variant='outline' className='mt-4 border-border dark:border-border' onClick={handleResetFilters}>
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
