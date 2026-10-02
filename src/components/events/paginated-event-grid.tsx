import type { ReactNode } from 'react'
import { useEffect, useMemo } from 'react'
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
  /** ステータス・条件バッジを隠し、終了時の grayscale を無効化する */
  compact?: boolean
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
  emptyState,
  compact = false
}: PaginatedEventGridProps) => {
  const totalPages = Math.max(1, Math.ceil(events.length / perPage))
  const effectivePage = Math.min(Math.max(1, page), totalPages)
  useEffect(() => {
    if (page !== effectivePage) onPageChange(effectivePage)
  }, [page, effectivePage, onPageChange])

  const paginatedEvents = useMemo(() => {
    const start = (effectivePage - 1) * perPage
    return events.slice(start, start + perPage)
  }, [events, effectivePage, perPage])

  if (events.length === 0) {
    return <>{emptyState}</>
  }

  const start = (effectivePage - 1) * perPage + 1
  const end = Math.min(effectivePage * perPage, events.length)

  return (
    <>
      <p className='text-sm text-muted-foreground mb-3'>
        全 {events.length} 件中 {start}–{end} 件を表示
      </p>
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'>
        {paginatedEvents.map((event, index) => (
          <EventGridItem key={event.uuid} event={event} index={index} compact={compact} />
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
                    if (effectivePage > 1) onPageChange(effectivePage - 1)
                  }}
                  className={effectivePage === 1 ? 'pointer-events-none opacity-50' : ''}
                />
              </PaginationItem>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                // 最初と最後のページ、現在のページの前後1ページを表示
                if (p === 1 || p === totalPages || (p >= effectivePage - 1 && p <= effectivePage + 1)) {
                  return (
                    <PaginationItem key={p}>
                      <PaginationLink
                        size='icon'
                        href='#'
                        onClick={(e) => {
                          e.preventDefault()
                          onPageChange(p)
                        }}
                        isActive={effectivePage === p}
                      >
                        {p}
                      </PaginationLink>
                    </PaginationItem>
                  )
                }
                // 省略記号を表示
                if (p === effectivePage - 2 || p === effectivePage + 2) {
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
                    if (effectivePage < totalPages) onPageChange(effectivePage + 1)
                  }}
                  className={effectivePage === totalPages ? 'pointer-events-none opacity-50' : ''}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </>
  )
}
