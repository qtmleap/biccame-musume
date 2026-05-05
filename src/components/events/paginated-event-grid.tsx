import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { EventGridItem } from '@/components/events/event-grid-item'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from '@/components/ui/pagination'
import type { Event } from '@/schemas/event.dto'

const DEFAULT_PER_PAGE = 12

type PaginatedEventGridProps = {
  /** 表示するイベント一覧 */
  events: Event[]
  /** 1ページあたりの表示件数 */
  perPage?: number
  /** 現在のページ番号（1始まり） */
  page: number
  /** ページ変更時のコールバック */
  onPageChange: (page: number) => void
  /** イベントが0件のときに表示する空状態 */
  emptyState?: ReactNode
}

/**
 * ページネーション付きイベントグリッド
 * イベント一覧・マイページの達成/興味イベントで共通利用する
 */
export const PaginatedEventGrid = ({
  events,
  perPage = DEFAULT_PER_PAGE,
  page,
  onPageChange,
  emptyState
}: PaginatedEventGridProps) => {
  const totalPages = Math.ceil(events.length / perPage)

  const paginatedEvents = useMemo(() => {
    const start = (page - 1) * perPage
    return events.slice(start, start + perPage)
  }, [events, page, perPage])

  if (events.length === 0) {
    return <>{emptyState}</>
  }

  const start = (page - 1) * perPage + 1
  const end = Math.min(page * perPage, events.length)

  return (
    <>
      <p className='text-sm text-muted-foreground mb-3'>
        全 {events.length} 件中 {start}–{end} 件を表示
      </p>
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'>
        {paginatedEvents.map((event, index) => (
          <EventGridItem key={event.uuid} event={event} index={index} />
        ))}
      </div>

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
                    if (page > 1) onPageChange(page - 1)
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
                          onPageChange(p)
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
                    if (page < totalPages) onPageChange(page + 1)
                  }}
                  className={page === totalPages ? 'pointer-events-none opacity-50' : ''}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </>
  )
}
