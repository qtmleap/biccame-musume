import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { ArrowLeft, Calendar, Gift, Link2, Package, Pencil, Store } from 'lucide-react'
import { Suspense } from 'react'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useCloudflareAccess } from '@/hooks/useCloudflareAccess'
import { useEvents } from '@/hooks/useEvents'
import { EVENT_CATEGORY_LABELS, REFERENCE_URL_TYPE_LABELS_LONG, STORE_NAME_LABELS } from '@/locales/app.content'
import type { Event, EventCategory } from '@/schemas/event.dto'
import type { StoreKey } from '@/schemas/store.dto'

/**
 * カテゴリに応じたスタイルを返す
 */
const getCategoryStyle = (category: EventCategory) => {
  switch (category) {
    case 'limited_card':
      return 'bg-purple-100 text-purple-700 border-purple-300'
    case 'regular_card':
      return 'bg-blue-100 text-blue-700 border-blue-300'
    case 'ackey':
      return 'bg-amber-100 text-amber-700 border-amber-300'
    default:
      return 'bg-pink-100 text-pink-700 border-pink-300'
  }
}

/**
 * 条件の詳細テキストを取得
 */
const getConditionDetail = (condition: Event['conditions'][0]): string => {
  switch (condition.type) {
    case 'purchase':
      return `${condition.purchaseAmount?.toLocaleString()}円以上購入`
    case 'first_come':
      return '先着'
    case 'lottery':
      return condition.quantity ? `抽選${condition.quantity}名` : '抽選'
    case 'everyone':
      return '全員に配布'
  }
}

/**
 * イベント詳細ページのコンテンツ
 */
const EventDetailContent = () => {
  const { eventId } = Route.useParams()
  const navigate = useNavigate()
  const { data: events = [], isLoading } = useEvents()
  const { isAuthenticated } = useCloudflareAccess()

  const event = events.find((e) => e.id === eventId)

  if (isLoading) {
    return <LoadingFallback />
  }

  if (!event) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-pink-50'>
        <div className='text-center'>
          <p className='text-gray-500 mb-4'>イベントが見つかりませんでした</p>
          <Button variant='outline' onClick={() => navigate({ to: '/events' })}>
            <ArrowLeft className='size-4 mr-2' />
            イベント一覧に戻る
          </Button>
        </div>
      </div>
    )
  }

  const categoryStyle = getCategoryStyle(event.category)
  const startDate = dayjs(event.startDate)
  const endDate = event.endedAt ? dayjs(event.endedAt) : event.endDate ? dayjs(event.endDate) : null
  const status = event.status

  return (
    <div className='min-h-screen bg-pink-50'>
      <div className='container mx-auto px-4 max-w-6xl'>
        <div className='max-w-2xl'>
          {/* 戻るボタン */}
          <div className='pt-4 pb-2'>
            <Button
              variant='ghost'
              size='sm'
              className='text-gray-600 hover:text-gray-900 -ml-2'
              onClick={() => navigate({ to: '/events' })}
            >
              <ArrowLeft className='h-4 w-4 mr-1' />
              戻る
            </Button>
          </div>

          {/* ヘッダー */}
          <div className='mb-6'>
            <div className='flex items-center gap-2 mb-2'>
              <Badge className={`${categoryStyle} border`}>{EVENT_CATEGORY_LABELS[event.category]}</Badge>
              {status === 'ongoing' && (
                <Badge className='bg-green-100 text-green-700 border-green-300 border'>開催中</Badge>
              )}
              {status === 'ended' && <Badge className='bg-gray-100 text-gray-700 border-gray-300 border'>終了</Badge>}
              {status === 'upcoming' && (
                <Badge className='bg-blue-100 text-blue-700 border-blue-300 border'>開催前</Badge>
              )}
            </div>
            <div className='flex items-center justify-between gap-4'>
              <h1 className='text-2xl font-bold text-gray-900'>{event.name}</h1>
              {isAuthenticated && (
                <Button
                  asChild
                  size='sm'
                  className='rounded-full px-4 h-7 text-xs font-semibold bg-transparent text-gray-900 border border-gray-300 hover:bg-gray-100'
                >
                  <Link to='/admin/events/$id/edit' params={{ id: event.id }}>
                    <Pencil className='h-3.5 w-3.5 mr-1' />
                    編集
                  </Link>
                </Button>
              )}
            </div>
          </div>

          {/* イベント情報セクション */}
          <div className='space-y-3'>
            <h2 className='text-xl font-bold text-gray-900'>イベント情報</h2>
            <div className='space-y-3'>
              {/* 開催期間 */}
              <div className='flex items-start gap-3'>
                <Calendar className='h-5 w-5 text-gray-400 shrink-0 mt-0.5' />
                <div className='min-w-0 flex-1'>
                  <p className='text-sm text-gray-500'>開催期間</p>
                  <p className='text-sm text-gray-900'>
                    {startDate.format('YYYY年M月D日')}
                    {endDate ? ` 〜 ${endDate.format('YYYY年M月D日')}` : ' 〜 なくなり次第終了'}
                  </p>
                  {event.endedAt && (
                    <p className='text-xs text-gray-500 mt-0.5'>
                      実際の終了: {dayjs(event.endedAt).format('YYYY年M月D日')}
                    </p>
                  )}
                </div>
              </div>

              {/* 対象店舗 */}
              {event.stores && event.stores.length > 0 && (
                <div className='flex items-start gap-3'>
                  <Store className='h-5 w-5 text-gray-400 shrink-0 mt-0.5' />
                  <div className='min-w-0 flex-1'>
                    <p className='text-sm text-gray-500'>対象店舗</p>
                    <div className='text-sm text-gray-900 flex flex-wrap gap-x-1'>
                      {event.stores.map((storeKey, index) => {
                        const storeName = STORE_NAME_LABELS[storeKey as StoreKey] || storeKey
                        return (
                          <span key={storeKey}>
                            <Link to='/location' search={{ id: storeKey }} className='text-pink-600 hover:underline'>
                              {storeName}
                            </Link>
                            {index < (event.stores?.length ?? 0) - 1 && <span>、</span>}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* 限定数 */}
              {event.limitedQuantity && !event.conditions.some((c) => c.type === 'everyone') && (
                <div className='flex items-start gap-3'>
                  <Package className='h-5 w-5 text-gray-400 shrink-0 mt-0.5' />
                  <div className='min-w-0 flex-1'>
                    <p className='text-sm text-gray-500'>限定数</p>
                    <p className='text-sm text-gray-900'>{event.limitedQuantity.toLocaleString()}個</p>
                  </div>
                </div>
              )}

              {/* 配布条件 */}
              <div className='flex items-start gap-3'>
                <Gift className='h-5 w-5 text-gray-400 shrink-0 mt-0.5' />
                <div className='min-w-0 flex-1'>
                  <p className='text-sm text-gray-500'>配布条件</p>
                  <div className='space-y-1'>
                    {event.conditions.map((condition, index) => (
                      <div key={index} className='text-sm text-gray-900'>
                        • {getConditionDetail(condition)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 参考URL */}
              {event.referenceUrls && event.referenceUrls.length > 0 && (
                <div className='flex items-start gap-3'>
                  <Link2 className='h-5 w-5 text-gray-400 shrink-0 mt-0.5' />
                  <div className='min-w-0 flex-1'>
                    <p className='text-sm text-gray-500'>参考URL</p>
                    <div className='space-y-1'>
                      {event.referenceUrls.map((ref) => (
                        <div key={ref.url}>
                          <a
                            href={ref.url}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='text-sm text-pink-600 hover:underline'
                          >
                            {REFERENCE_URL_TYPE_LABELS_LONG[ref.type]}
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * ルートコンポーネント
 */
const RouteComponent = () => (
  <Suspense fallback={<LoadingFallback />}>
    <EventDetailContent />
  </Suspense>
)

export const Route = createFileRoute('/events/$eventId')({
  component: RouteComponent
})
