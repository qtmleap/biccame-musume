import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { useAtom } from 'jotai'
import { orderBy } from 'lodash-es'
import { Calendar, ExternalLink, Package, Pencil, Store, Trash2 } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo } from 'react'
import { eventListActiveTabAtom, eventListPagesAtom } from '@/atoms/eventListAtom'
import { eventStatusFilterAtom } from '@/atoms/eventStatusFilterAtom'
import { EventStatusFilter } from '@/components/events/event-status-filter'
import { Button } from '@/components/ui/button'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from '@/components/ui/pagination'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { useCloudflareAccess } from '@/hooks/useCloudflareAccess'
import { useDeleteEvent, useEvents } from '@/hooks/useEvents'
import { EVENT_CATEGORY_LABELS, STORE_NAME_LABELS } from '@/locales/app.content'
import { STATUS_BADGE } from '@/locales/component.content'
import type { Event } from '@/schemas/event.dto'
import type { StoreKey } from '@/schemas/store.dto'

/**
 * イベントカードコンポーネント
 */
const EventCard = ({
  event,
  onDelete,
  isAuthenticated
}: {
  event: Event
  onDelete: (id: string) => void
  isAuthenticated: boolean
}) => {
  // 終了判定
  const now = dayjs()
  const end = event.endDate ? dayjs(event.endDate) : null
  const isEnded = event.endedAt != null || (end && now.isAfter(end))

  return (
    <div className={`border rounded-lg p-4 bg-white flex flex-col h-full ${isEnded ? 'opacity-50 grayscale' : ''}`}>
      <div className='mb-2 flex items-start justify-between gap-3'>
        <div className='flex-1'>
          <h3 className='text-sm font-semibold text-gray-900'>{event.name}</h3>
          <div className='mt-1 flex flex-col gap-1 text-xs text-muted-foreground'>
            <span className='flex items-center gap-1'>
              <Calendar className='size-3' />
              <span>{dayjs(event.startDate).format('YYYY/MM/DD')}</span>
              {event.endDate ? (
                <>
                  <span>〜</span>
                  <span>{dayjs(event.endDate).format('YYYY/MM/DD')}</span>
                </>
              ) : (
                <span>〜なくなり次第終了</span>
              )}
            </span>
            <div className='flex flex-wrap items-center gap-2'>
              {event.stores && event.stores.length > 0 && (
                <span className='flex items-center gap-1'>
                  <Store className='size-3' />
                  {event.stores.length === 1
                    ? STORE_NAME_LABELS[event.stores[0] as StoreKey]
                    : `${event.stores.length}店舗`}
                </span>
              )}
              {event.limitedQuantity && !event.conditions.some((c) => c.type === 'everyone') && (
                <span className='flex items-center gap-1'>
                  <Package className='size-3' />
                  限定{event.limitedQuantity}個
                </span>
              )}
            </div>
          </div>
        </div>
        {STATUS_BADGE[event.status]}
      </div>

      {/* アクション */}
      <div className='flex items-center justify-between mt-auto'>
        <div className='flex items-center gap-1'>
          <Link to='/events/$eventId' params={{ eventId: event.id }}>
            <Button size='sm' variant='outline' className='h-7 text-xs'>
              <ExternalLink className='mr-1 size-3' />
              詳細
            </Button>
          </Link>
        </div>
        {isAuthenticated && (
          <div className='flex items-center gap-2'>
            <Link to='/admin/events/$id/edit/' params={{ id: event.id }}>
              <Button size='sm' variant='outline' className='h-7 text-xs'>
                <Pencil className='mr-1 size-3' />
                編集
              </Button>
            </Link>
            <Button
              size='sm'
              variant='outline'
              onClick={() => onDelete(event.id)}
              className='h-7 text-xs text-destructive hover:bg-destructive/10'
            >
              <Trash2 className='mr-1 size-3' />
              削除
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

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
  const perPage = 12

  const page = pages[activeTab]

  const setPage = (p: number) => {
    setPages((prev) => ({ ...prev, [activeTab]: p }))
  }

  // カテゴリ別とステータス別にフィルタリングし、開始日時・カテゴリ・店舗順でソート
  const filtered = useMemo(() => {
    const list = events.filter((e) => {
      if (e.category !== activeTab) return false

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
  }, [events, activeTab, statusFilter])

  // ページネーション処理
  const totalPages = Math.ceil(filtered.length / perPage)
  const paginated = useMemo(() => {
    const start = (page - 1) * perPage
    return filtered.slice(start, start + perPage)
  }, [filtered, page])

  /**
   * イベントを削除
   */
  const handleDelete = async (id: string) => {
    if (confirm('このイベントを削除しますか?')) {
      try {
        await deleteEvent.mutateAsync(id)
      } catch {
        alert('削除に失敗しました')
      }
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
      {/* ステータスフィルタ */}
      <div className='mb-4'>
        <EventStatusFilter statusFilterAtom={eventStatusFilterAtom} />
      </div>

      <div className='mb-4 relative bg-gray-200 rounded-lg p-1'>
        <div className='flex relative'>
          {(['limited_card', 'regular_card', 'ackey', 'other'] as const).map((category) => (
            <button
              key={category}
              type='button'
              onClick={() => setActiveTab(category)}
              className='relative flex-1 py-1.5 text-xs font-semibold text-center z-10 transition-colors'
            >
              <span className={activeTab === category ? 'text-gray-900' : 'text-gray-600'}>
                {EVENT_CATEGORY_LABELS[category]}
              </span>
              {activeTab === category && (
                <motion.div
                  layoutId='activeTab'
                  className='absolute inset-0 bg-white rounded-md shadow-sm -z-10'
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {(['limited_card', 'regular_card', 'ackey', 'other'] as const).map((category) => (
        <TabsContent key={category} value={category}>
          {filtered.length === 0 ? (
            <div className='rounded-lg border p-6 text-center'>
              <p className='text-sm text-muted-foreground'>{EVENT_CATEGORY_LABELS[category]}のイベントはありません</p>
            </div>
          ) : (
            <>
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
                {paginated.map((event) => (
                  <EventCard key={event.id} event={event} onDelete={handleDelete} isAuthenticated={isAuthenticated} />
                ))}
              </div>

              {/* ページネーション */}
              {totalPages > 1 && (
                <div className='mt-6'>
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          size='default'
                          href='#'
                          onClick={(e) => {
                            e.preventDefault()
                            if (page > 1) setPage(page - 1)
                          }}
                          className={page === 1 ? 'pointer-events-none opacity-50' : ''}
                        />
                      </PaginationItem>

                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                        // 最初と最後のページ、現在のページの前後1ページを表示
                        if (p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1)) {
                          return (
                            <PaginationItem key={p}>
                              <PaginationLink
                                size='icon'
                                href='#'
                                onClick={(e) => {
                                  e.preventDefault()
                                  setPage(p)
                                }}
                                isActive={page === p}
                              >
                                {p}
                              </PaginationLink>
                            </PaginationItem>
                          )
                        }
                        // 省略記号を表示
                        if (p === page - 2 || p === page + 2) {
                          return (
                            <PaginationItem key={p}>
                              <PaginationEllipsis />
                            </PaginationItem>
                          )
                        }
                        return null
                      })}

                      <PaginationItem>
                        <PaginationNext
                          size='default'
                          href='#'
                          onClick={(e) => {
                            e.preventDefault()
                            if (page < totalPages) setPage(page + 1)
                          }}
                          className={page === totalPages ? 'pointer-events-none opacity-50' : ''}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </>
          )}
        </TabsContent>
      ))}
    </Tabs>
  )
}
