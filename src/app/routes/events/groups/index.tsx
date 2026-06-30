import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { ArrowLeft, Calendar, FolderTree, Package } from 'lucide-react'
import { motion } from 'motion/react'
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
import { useMediaQuery } from '@/hooks/use-media-query'
import { getStickerRotation, STICKER_HOVER_TRANSITION, STICKER_SHADOW_SM, STICKER_TAPES } from '@/lib/sticker'
import { cn } from '@/lib/utils'
import type { EventGroup } from '@/schemas/event-group.dto'

const PER_PAGE = 12

type EventGroupGridItemProps = {
  group: EventGroup
  index: number
}

const EventGroupGridItem = ({ group, index }: EventGroupGridItemProps) => {
  const isMultiColumn = useMediaQuery('(min-width: 640px)')
  const rotationDeg = isMultiColumn ? getStickerRotation(index) : 0
  const tape = STICKER_TAPES[index % STICKER_TAPES.length]

  return (
    <motion.div className='h-full' style={{ filter: STICKER_SHADOW_SM }}>
      <motion.div
        className='h-full'
        style={{ rotate: rotationDeg }}
        whileHover={{ scale: 1.04, rotate: 0 }}
        whileTap={{ scale: 0.97 }}
        transition={STICKER_HOVER_TRANSITION}
      >
        <Link
          to='/events/group/$id'
          params={{ id: group.uuid }}
          className='relative block rounded-xl p-4 border border-zinc-200 dark:border-card-border h-full bg-card'
        >
          {tape && (
            <div aria-hidden className={cn('absolute rounded-sm', tape.position, tape.size, tape.color, tape.angle)} />
          )}
          <div className='mb-2 flex items-start justify-between gap-3'>
            <div className='flex-1 min-w-0'>
              <h3 className='text-base font-semibold text-foreground line-clamp-2'>{group.title}</h3>
              <div className='mt-1 flex flex-col gap-1 text-xs text-muted-foreground'>
                <span className='flex items-center gap-1'>
                  <Calendar className='size-3.5' />
                  <span>{dayjs(group.startDate).format('YYYY/MM/DD')}</span>
                  {group.endDate ? (
                    <>
                      <span>〜</span>
                      <span>{dayjs(group.endDate).format('YYYY/MM/DD')}</span>
                    </>
                  ) : (
                    <span>〜期間未定</span>
                  )}
                </span>
                <span className='flex items-center gap-1'>
                  <Package className='size-3.5' />
                  {group.eventCount} 件
                </span>
              </div>
              {group.description && (
                <p className='mt-2 text-xs text-muted-foreground line-clamp-2'>{group.description}</p>
              )}
            </div>
          </div>
        </Link>
      </motion.div>
    </motion.div>
  )
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
      <div className='mx-auto max-w-6xl px-4 py-4 md:px-8 md:py-6'>
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
          <h1 className='text-2xl font-bold text-foreground'>イベントグループ一覧</h1>
          <p className='mt-1 text-sm text-muted-foreground'>
            関連イベントをまとめて、コンプ状況をひと目で確認できます。
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
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'>
              {paginatedGroups.map((group, i) => (
                <EventGroupGridItem key={group.uuid} group={group} index={(currentPage - 1) * PER_PAGE + i} />
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
