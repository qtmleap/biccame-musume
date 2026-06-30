import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { ArrowLeft, FolderTree, Sparkles } from 'lucide-react'
import { Suspense, useMemo, useState } from 'react'
import { AppBreadcrumb } from '@/components/common/breadcrumb'
import { ErrorBoundary } from '@/components/common/error-boundary'
import { LoadingFallback } from '@/components/common/loading-fallback'
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
import { useEventGroups } from '@/hooks/use-event-groups'
import type { EventGroup } from '@/schemas/event-group.dto'

const PER_PAGE = 12

const formatPeriod = (group: EventGroup): string => {
  const start = dayjs(group.startDate).format('YYYY/MM/DD')
  if (!group.endDate) return `${start} 〜 期間未定`
  return `${start} 〜 ${dayjs(group.endDate).format('YYYY/MM/DD')}`
}

const GroupsContent = () => {
  const router = useRouter()
  const { data: groups } = useEventGroups()
  const [page, setPage] = useState(1)

  const totalPages = Math.max(1, Math.ceil(groups.length / PER_PAGE))
  const currentPage = Math.min(page, totalPages)
  const paginatedGroups = useMemo(() => {
    const start = (currentPage - 1) * PER_PAGE
    return groups.slice(start, start + PER_PAGE)
  }, [groups, currentPage])

  const start = (currentPage - 1) * PER_PAGE + 1
  const end = Math.min(currentPage * PER_PAGE, groups.length)

  return (
    <div className='min-h-screen bg-page-bg'>
      <div className='mx-auto max-w-4xl px-4 py-4 md:px-8 md:py-6'>
        <AppBreadcrumb items={[{ label: 'ホーム', to: '/' }, { label: 'イベントグループ' }]} />

        <Button
          variant='ghost'
          size='sm'
          className='text-muted-foreground hover:text-foreground -ml-2 mb-4 border border-transparent'
          onClick={() => router.history.back()}
        >
          <ArrowLeft className='h-4 w-4 mr-1' />
          戻る
        </Button>

        <div className='mb-6'>
          <div className='flex items-center gap-2'>
            <Sparkles className='size-5 text-action-award' />
            <h1 className='text-2xl font-bold text-foreground'>イベントグループ</h1>
          </div>
          <p className='mt-1 text-sm text-muted-foreground'>
            複数イベントを束ねたグループを店舗別にコンプリートしよう。
          </p>
        </div>

        {groups.length === 0 ? (
          <div className='rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground'>
            <FolderTree className='mx-auto mb-2 size-8' />
            <p className='text-sm'>イベントグループはまだありません。</p>
          </div>
        ) : (
          <>
            <p className='text-sm text-muted-foreground mb-3'>
              全 {groups.length} 件中 {start}–{end} 件を表示
            </p>
            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
              {paginatedGroups.map((group) => (
                <Link
                  key={group.uuid}
                  to='/events/group/$id'
                  params={{ id: group.uuid }}
                  className='group block rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:border-action-award/40 hover:shadow-md'
                >
                  <div className='flex items-center gap-3'>
                    <div className='shrink-0 p-2 rounded-lg bg-action-award/15 text-action-award'>
                      <Sparkles className='size-4' />
                    </div>
                    <div className='min-w-0 flex-1'>
                      <h2 className='text-base font-semibold text-foreground group-hover:text-action-award'>
                        {group.title}
                      </h2>
                      <div className='mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground'>
                        <span>{formatPeriod(group)}</span>
                        <span>所属イベント: {group.eventCount} 件</span>
                      </div>
                      {group.description && (
                        <p className='mt-1 text-sm text-foreground/80 line-clamp-2'>{group.description}</p>
                      )}
                    </div>
                  </div>
                </Link>
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
                          if (currentPage > 1) setPage(currentPage - 1)
                        }}
                        className={currentPage === 1 ? 'pointer-events-none opacity-50' : ''}
                      />
                    </PaginationItem>

                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                      if (p === 1 || p === totalPages || (p >= currentPage - 1 && p <= currentPage + 1)) {
                        return (
                          <PaginationItem key={p}>
                            <PaginationLink
                              size='icon'
                              href='#'
                              onClick={(e) => {
                                e.preventDefault()
                                setPage(p)
                              }}
                              isActive={currentPage === p}
                            >
                              {p}
                            </PaginationLink>
                          </PaginationItem>
                        )
                      }
                      if (p === currentPage - 2 || p === currentPage + 2) {
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
                          if (currentPage < totalPages) setPage(currentPage + 1)
                        }}
                        className={currentPage === totalPages ? 'pointer-events-none opacity-50' : ''}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const GroupsPage = () => (
  <ErrorBoundary>
    <Suspense fallback={<LoadingFallback />}>
      <GroupsContent />
    </Suspense>
  </ErrorBoundary>
)

export const Route = createFileRoute('/events/groups/')({
  component: GroupsPage
})
