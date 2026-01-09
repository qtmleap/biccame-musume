import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { ArrowLeft, Calendar, ExternalLink, Gift, Package, Pencil, Store } from 'lucide-react'
import { Suspense } from 'react'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useCharacters } from '@/hooks/useCharacters'
import { useCloudflareAccess } from '@/hooks/useCloudflareAccess'
import { useEvents } from '@/hooks/useEvents'
import { EVENT_CATEGORY_LABELS, REFERENCE_URL_TYPE_LABELS_LONG } from '@/locales/app.content'
import type { Event, EventCategory } from '@/schemas/event.dto'

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
      return `${condition.purchaseAmount?.toLocaleString()}円以上購入で配布`
    case 'first_come':
      return condition.quantity ? `先着${condition.quantity}名` : '先着順'
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
  const { data: characters = [] } = useCharacters()
  const { isAuthenticated } = useCloudflareAccess()

  const event = events.find((e) => e.id === eventId)

  /**
   * 店舗名からキャラクターのkeyを取得
   */
  const getCharacterKeyByStoreName = (storeName: string): string | null => {
    const character = characters.find((c) => c.store_name === storeName)
    return character?.key ?? null
  }

  if (isLoading) {
    return <LoadingFallback />
  }

  if (!event) {
    return (
      <div className='container mx-auto px-4 py-8'>
        <div className='max-w-2xl mx-auto py-12 text-center'>
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
  const endDate = event.actualEndDate ? dayjs(event.actualEndDate) : event.endDate ? dayjs(event.endDate) : null
  // EventSchemaで計算されたstatusを使用
  const status = event.status

  return (
    <div className='container mx-auto px-4 py-8 max-w-6xl'>
      {/* 戻るボタン */}
      <Button variant='ghost' onClick={() => navigate({ to: '/events' })} className='mb-4'>
        <ArrowLeft className='size-4 mr-2' />
        イベント一覧に戻る
      </Button>

      {/* ヘッダー */}
      <div className='mb-6'>
        <div className='flex items-center gap-2 mb-2'>
          <Badge className={`${categoryStyle} border`}>{EVENT_CATEGORY_LABELS[event.category]}</Badge>
          {status === 'ongoing' && (
            <Badge className='bg-green-100 text-green-700 border-green-300 border'>開催中</Badge>
          )}
          {status === 'ended' && <Badge className='bg-gray-100 text-gray-700 border-gray-300 border'>終了</Badge>}
          {status === 'upcoming' && <Badge className='bg-blue-100 text-blue-700 border-blue-300 border'>開催前</Badge>}
        </div>
        <div className='flex items-center justify-between gap-4'>
          <h1 className='text-2xl font-bold text-gray-900'>{event.name}</h1>
          {isAuthenticated && (
            <Button variant='outline' size='sm' asChild>
              <Link to='/admin/events/$id/edit' params={{ id: event.id }}>
                <Pencil className='size-4 mr-1' />
                編集
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* コンテンツ - デスクトップでGrid表示 */}
      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
        {/* 期間 */}
        <div>
          <div className='flex items-center gap-2 text-sm font-medium text-gray-700 mb-2'>
            <Calendar className='size-4' />
            開催期間
          </div>
          <p className='text-gray-900 ml-6'>
            {startDate.format('YYYY年M月D日')}
            {endDate ? ` 〜 ${endDate.format('YYYY年M月D日')}` : ' 〜 なくなり次第終了'}
          </p>
          {event.actualEndDate && (
            <p className='text-sm text-gray-500 ml-6 mt-1'>
              実際の終了: {dayjs(event.actualEndDate).format('YYYY年M月D日')}
            </p>
          )}
        </div>

        {/* 店舗 */}
        {event.stores && event.stores.length > 0 && (
          <div>
            <div className='flex items-center gap-2 text-sm font-medium text-gray-700 mb-2'>
              <Store className='size-4' />
              対象店舗
            </div>
            <div className='ml-6 flex flex-wrap gap-x-2 gap-y-1'>
              {event.stores.map((storeName, index) => {
                const characterKey = getCharacterKeyByStoreName(storeName)
                return (
                  <span key={storeName}>
                    {characterKey ? (
                      <Link
                        to='/location'
                        search={{ id: characterKey }}
                        className='text-[#e50012] hover:text-[#c40010] hover:underline transition-colors'
                      >
                        {storeName}
                      </Link>
                    ) : (
                      <span className='text-gray-900'>{storeName}</span>
                    )}
                    {index < (event.stores?.length ?? 0) - 1 && <span className='text-gray-900'>、</span>}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* 限定数（全員配布の場合は表示しない） */}
        {event.limitedQuantity && !event.conditions.some((c) => c.type === 'everyone') && (
          <div>
            <div className='flex items-center gap-2 text-sm font-medium text-gray-700 mb-2'>
              <Package className='size-4' />
              限定数
            </div>
            <p className='text-gray-900 ml-6'>{event.limitedQuantity.toLocaleString()}個</p>
          </div>
        )}

        {/* 配布条件 */}
        <div>
          <div className='flex items-center gap-2 text-sm font-medium text-gray-700 mb-2'>
            <Gift className='size-4' />
            配布条件
          </div>
          <ul className='ml-6 space-y-1'>
            {event.conditions.map((condition, index) => (
              <li key={index} className='text-gray-900'>
                • {getConditionDetail(condition)}
              </li>
            ))}
          </ul>
        </div>

        {/* 参考URL - 幅いっぱい */}
        {event.referenceUrls && event.referenceUrls.length > 0 && (
          <div className='md:col-span-2'>
            <div className='flex items-center gap-2 text-sm font-medium text-gray-700 mb-2'>
              <ExternalLink className='size-4' />
              参考URL
            </div>
            <div className='ml-6 flex flex-wrap gap-4'>
              {event.referenceUrls.map((ref, index) => (
                <a
                  key={index}
                  href={ref.url}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='inline-flex items-center gap-1 text-[#e50012] hover:text-[#c40010] hover:underline transition-colors'
                >
                  {REFERENCE_URL_TYPE_LABELS_LONG[ref.type]}
                  <ExternalLink className='size-3' />
                </a>
              ))}
            </div>
          </div>
        )}
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
