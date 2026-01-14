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
import { Badge } from '@/components/ui/badge'
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
import type { Event } from '@/schemas/event.dto'
import type { StoreKey } from '@/schemas/store.dto'

/**
 * ステータスに応じたBadgeを返す
 */
const StatusBadge = ({ campaign }: { campaign: Event }) => {
  // ガントチャートと同様に、endDateも考慮したstatus計算
  const currentTime = dayjs()
  const endDate = campaign.endDate ? dayjs(campaign.endDate) : null
  const status = (() => {
    if (campaign.endedAt != null) return 'ended'
    if (endDate && currentTime.isAfter(endDate)) return 'ended'
    if (currentTime.isBefore(dayjs(campaign.startDate))) return 'upcoming'
    return 'ongoing'
  })()

  switch (status) {
    case 'upcoming':
      return (
        <Badge variant='outline' className='border-blue-600 bg-blue-50 text-blue-700'>
          開催前
        </Badge>
      )
    case 'ongoing':
      return (
        <Badge variant='outline' className='border-green-600 bg-green-50 text-green-700'>
          開催中
        </Badge>
      )
    case 'ended':
      return <Badge variant='secondary'>終了</Badge>
  }
}

/**
 * キャンペーンカードコンポーネント
 */
const CampaignCard = ({
  campaign,
  onDelete,
  isAuthenticated
}: {
  campaign: Event
  onDelete: (id: string) => void
  isAuthenticated: boolean
}) => {
  // 終了判定
  const currentTime = dayjs()
  const endDate = campaign.endDate ? dayjs(campaign.endDate) : null
  const isEnded = campaign.endedAt != null || (endDate && currentTime.isAfter(endDate))

  return (
    <div className={`border rounded-lg p-4 bg-white flex flex-col h-full ${isEnded ? 'opacity-50 grayscale' : ''}`}>
      <div className='mb-2 flex items-start justify-between gap-3'>
        <div className='flex-1'>
          <h3 className='text-sm font-semibold text-gray-900'>{campaign.name}</h3>
          <div className='mt-1 flex flex-col gap-1 text-xs text-muted-foreground'>
            <span className='flex items-center gap-1'>
              <Calendar className='size-3' />
              <span>{dayjs(campaign.startDate).format('YYYY/MM/DD')}</span>
              {campaign.endDate ? (
                <>
                  <span>〜</span>
                  <span>{dayjs(campaign.endDate).format('YYYY/MM/DD')}</span>
                </>
              ) : (
                <span>〜なくなり次第終了</span>
              )}
            </span>
            <div className='flex flex-wrap items-center gap-2'>
              {campaign.stores && campaign.stores.length > 0 && (
                <span className='flex items-center gap-1'>
                  <Store className='size-3' />
                  {campaign.stores.length === 1
                    ? STORE_NAME_LABELS[campaign.stores[0] as StoreKey]
                    : `${campaign.stores.length}店舗`}
                </span>
              )}
              {campaign.limitedQuantity && !campaign.conditions.some((c) => c.type === 'everyone') && (
                <span className='flex items-center gap-1'>
                  <Package className='size-3' />
                  限定{campaign.limitedQuantity}個
                </span>
              )}
            </div>
          </div>
        </div>
        <StatusBadge campaign={campaign} />
      </div>

      {/* アクション */}
      <div className='flex items-center justify-between mt-auto'>
        <div className='flex items-center gap-1'>
          <Link to='/events/$eventId' params={{ eventId: campaign.id }}>
            <Button size='sm' variant='outline' className='h-7 text-xs'>
              <ExternalLink className='mr-1 size-3' />
              詳細
            </Button>
          </Link>
        </div>
        {isAuthenticated && (
          <div className='flex items-center gap-2'>
            <Link to='/admin/events/$id/edit' params={{ id: campaign.id }}>
              <Button size='sm' variant='outline' className='h-7 text-xs'>
                <Pencil className='mr-1 size-3' />
                編集
              </Button>
            </Link>
            <Button
              size='sm'
              variant='outline'
              onClick={() => onDelete(campaign.id)}
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
  const { data: campaigns = [], isLoading, error } = useEvents()
  const deleteEvent = useDeleteEvent()
  const { isAuthenticated } = useCloudflareAccess()
  const [activeTab, setActiveTab] = useAtom(eventListActiveTabAtom)
  const [pages, setPages] = useAtom(eventListPagesAtom)
  const [statusFilter, _setStatusFilter] = useAtom(eventStatusFilterAtom)
  const itemsPerPage = 12

  const currentPage = pages[activeTab]

  const setCurrentPage = (page: number) => {
    setPages((prev) => ({ ...prev, [activeTab]: page }))
  }

  // カテゴリ別とステータス別にフィルタリングし、開始日時・カテゴリ・店舗順でソート
  const filteredCampaigns = useMemo(() => {
    const filtered = campaigns.filter((campaign) => {
      if (campaign.category !== activeTab) return false

      // ステータスを計算
      const currentTime = dayjs()
      const endDate = campaign.endDate ? dayjs(campaign.endDate) : null
      const status = (() => {
        if (campaign.endedAt != null) return 'ended'
        if (endDate && currentTime.isAfter(endDate)) return 'ended'
        if (currentTime.isBefore(dayjs(campaign.startDate))) return 'upcoming'
        return 'ongoing'
      })()

      // ステータスフィルタを適用
      return statusFilter[status]
    })

    return orderBy(
      filtered,
      [(c) => dayjs(c.startDate).valueOf(), (c) => c.category, (c) => c.stores?.[0] || ''],
      ['asc', 'asc', 'asc']
    )
  }, [campaigns, activeTab, statusFilter])

  // ページネーション処理
  const totalPages = Math.ceil(filteredCampaigns.length / itemsPerPage)
  const paginatedCampaigns = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return filteredCampaigns.slice(startIndex, startIndex + itemsPerPage)
  }, [filteredCampaigns, currentPage])

  /**
   * キャンペーンを削除
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

  if (campaigns.length === 0) {
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
          {filteredCampaigns.length === 0 ? (
            <div className='rounded-lg border p-6 text-center'>
              <p className='text-sm text-muted-foreground'>{EVENT_CATEGORY_LABELS[category]}のイベントはありません</p>
            </div>
          ) : (
            <>
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
                {paginatedCampaigns.map((campaign) => (
                  <CampaignCard
                    key={campaign.id}
                    campaign={campaign}
                    onDelete={handleDelete}
                    isAuthenticated={isAuthenticated}
                  />
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
                            if (currentPage > 1) setCurrentPage(currentPage - 1)
                          }}
                          className={currentPage === 1 ? 'pointer-events-none opacity-50' : ''}
                        />
                      </PaginationItem>

                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                        // 最初と最後のページ、現在のページの前後1ページを表示
                        if (page === 1 || page === totalPages || (page >= currentPage - 1 && page <= currentPage + 1)) {
                          return (
                            <PaginationItem key={page}>
                              <PaginationLink
                                size='icon'
                                href='#'
                                onClick={(e) => {
                                  e.preventDefault()
                                  setCurrentPage(page)
                                }}
                                isActive={currentPage === page}
                              >
                                {page}
                              </PaginationLink>
                            </PaginationItem>
                          )
                        }
                        // 省略記号を表示
                        if (page === currentPage - 2 || page === currentPage + 2) {
                          return (
                            <PaginationItem key={page}>
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
                            if (currentPage < totalPages) setCurrentPage(currentPage + 1)
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
        </TabsContent>
      ))}
    </Tabs>
  )
}
