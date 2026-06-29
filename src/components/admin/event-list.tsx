import dayjs from 'dayjs'
import { useAtom } from 'jotai'
import { orderBy } from 'lodash-es'
import { motion } from 'motion/react'
import { useMemo } from 'react'
import { eventListAdminStoreFilterAtom } from '@/atoms/event-list-admin-store-filter-atom'
import { eventListActiveTabAtom, eventListPagesAtom } from '@/atoms/event-list-atom'
import { eventStatusFilterAtom } from '@/atoms/event-status-filter-atom'
import { EventCard } from '@/components/admin/event-card'
import { EventListPagination } from '@/components/admin/event-list-pagination'
import { EventStatusFilter } from '@/components/events/event-status-filter'
import { EventStoreFilter } from '@/components/events/event-store-filter'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { useCloudflareAccess } from '@/hooks/use-cloudflare-access'
import { useDeleteEvent, useEvents } from '@/hooks/use-events'
import { EVENT_CATEGORY_LABELS, EVENT_LIST_LABELS } from '@/locales/app.content'
import type { Event } from '@/schemas/event.dto'
import type { StoreKey } from '@/schemas/store.dto'

const CATEGORIES = ['limited_card', 'regular_card', 'ackey', 'other'] as const

/**
 * イベント一覧
 */
export const EventList = () => {
  const { data: events = [], isLoading, error } = useEvents()
  const deleteEvent = useDeleteEvent()
  const { isAuthenticated } = useCloudflareAccess()
  const [activeTab, setActiveTab] = useAtom(eventListActiveTabAtom)
  const [pages, setPages] = useAtom(eventListPagesAtom)
  const [statusFilter] = useAtom(eventStatusFilterAtom)
  const [storeFilter, setStoreFilter] = useAtom(eventListAdminStoreFilterAtom)
  const perPage = 12

  const page = pages[activeTab]

  const setPage = (p: number) => {
    setPages((prev) => ({ ...prev, [activeTab]: p }))
  }

  // カテゴリ別・ステータス別・店舗別にフィルタリングし、開始日時・カテゴリ・店舗順でソート
  const filtered = useMemo(() => {
    const list = events.filter((e) => {
      if (e.category !== activeTab) return false

      // 店舗フィルタを適用
      if (storeFilter !== null && !e.stores?.includes(storeFilter as StoreKey)) return false

      // ステータスを計算
      const now = dayjs()
      const end = e.endDate ? dayjs(e.endDate) : null
      const status = (() => {
        if (e.endedAt != null) return 'ended'
        if (end && now.isAfter(end)) return 'ended'
        if (now.isBefore(dayjs(e.startDate))) return 'upcoming'
        return 'ongoing'
      })()

      // ステータスフィルタを適用
      return statusFilter[status]
    })

    return orderBy(
      list,
      [(e) => dayjs(e.startDate).valueOf(), (e) => e.category, (e) => e.stores?.[0] || ''],
      ['asc', 'asc', 'asc']
    )
  }, [events, activeTab, statusFilter, storeFilter])

  // ページネーション処理（フィルタ変更で結果が減った場合は範囲内に clamp）
  const totalPages = Math.ceil(filtered.length / perPage)
  const effectivePage = Math.min(Math.max(page, 1), Math.max(totalPages, 1))
  const paginated = useMemo(() => {
    const start = (effectivePage - 1) * perPage
    return filtered.slice(start, start + perPage)
  }, [filtered, effectivePage])

  /**
   * イベントを削除
   */
  const handleDelete = async (id: string) => {
    try {
      await deleteEvent.mutateAsync(id)
    } catch {
      alert(EVENT_LIST_LABELS.deleteError)
    }
  }

  if (isLoading) {
    return (
      <div className='rounded-lg border p-6 text-center'>
        <p className='text-sm text-muted-foreground'>読み込み中...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className='rounded-lg border p-6 text-center'>
        <p className='text-sm text-destructive'>エラーが発生しました</p>
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className='rounded-lg border p-6 text-center'>
        <p className='text-sm text-muted-foreground'>登録されたイベントはありません</p>
      </div>
    )
  }

  return (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Event['category'])}>
      {/* ステータス・店舗フィルタ */}
      <div className='mb-4 flex flex-col gap-3 md:flex-row md:items-start md:gap-4'>
        <div className='flex-1'>
          <EventStatusFilter statusFilterAtom={eventStatusFilterAtom} />
        </div>
        <div className='w-full md:w-64 md:shrink-0'>
          <EventStoreFilter value={storeFilter} onChange={setStoreFilter} />
        </div>
      </div>

      <div className='mb-4 relative bg-muted rounded-lg p-1'>
        <div className='flex relative'>
          {CATEGORIES.map((category) => (
            <button
              key={category}
              type='button'
              onClick={() => setActiveTab(category)}
              className='relative flex-1 py-1.5 text-xs font-semibold text-center z-10 transition-colors'
            >
              <span className={activeTab === category ? 'text-foreground' : 'text-muted-foreground'}>
                {EVENT_CATEGORY_LABELS[category]}
              </span>
              {activeTab === category && (
                <motion.div
                  layoutId='activeTab'
                  className='absolute inset-0 bg-card rounded-md shadow-sm -z-10'
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {CATEGORIES.map((category) => (
        <TabsContent key={category} value={category}>
          {filtered.length === 0 ? (
            <div className='rounded-lg border p-6 text-center'>
              <p className='text-sm text-muted-foreground'>{EVENT_CATEGORY_LABELS[category]}のイベントはありません</p>
            </div>
          ) : (
            <>
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
                {paginated.map((event, index) => (
                  <EventCard
                    key={event.uuid}
                    event={event}
                    index={index}
                    onDelete={handleDelete}
                    isAuthenticated={isAuthenticated}
                  />
                ))}
              </div>

              <EventListPagination page={page} totalPages={totalPages} onChange={setPage} />
            </>
          )}
        </TabsContent>
      ))}
    </Tabs>
  )
}
