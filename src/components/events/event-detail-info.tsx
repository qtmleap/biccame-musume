import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { Calendar, Gift, Link2, Package, Store } from 'lucide-react'
import { REFERENCE_URL_TYPE_LABELS_LONG, STORE_NAME_LABELS } from '@/locales/app.content'
import type { Event } from '@/schemas/event.dto'
import type { StoreKey } from '@/schemas/store.dto'

type EventDetailInfoProps = {
  event: Event
}

/**
 * 条件の詳細テキストを取得
 */
const getConditionDetail = (condition: Event['conditions'][0]): string => {
  switch (condition.type) {
    case 'purchase':
      return `${(condition.purchaseAmount ?? 0).toLocaleString()}円以上購入`
    case 'first_come':
      return '先着'
    case 'lottery':
      return condition.quantity ? `抽選${condition.quantity}名` : '抽選'
    case 'everyone':
      return '全員に配布'
  }
}

/**
 * 開催期間セクション
 */
const EventPeriodSection = ({ event }: { event: Event }) => {
  const startDate = dayjs(event.startDate)
  const endDate = event.endedAt ? dayjs(event.endedAt) : event.endDate ? dayjs(event.endDate) : null

  return (
    <div className='flex items-start gap-3'>
      <Calendar className='h-5 w-5 text-gray-400 shrink-0 mt-0.5' />
      <div className='min-w-0 flex-1'>
        <p className='text-sm text-gray-500'>開催期間</p>
        <p className='text-sm text-gray-900'>
          {startDate.format('YYYY年M月D日')}
          {endDate ? ` 〜 ${endDate.format('YYYY年M月D日')}` : ' 〜 なくなり次第終了'}
        </p>
        {event.endedAt && (
          <p className='text-xs text-gray-500 mt-0.5'>実際の終了: {dayjs(event.endedAt).format('YYYY年M月D日')}</p>
        )}
      </div>
    </div>
  )
}

/**
 * 対象店舗セクション
 */
const EventStoresSection = ({ stores }: { stores: string[] }) => {
  if (!stores || stores.length === 0) return null

  return (
    <div className='flex items-start gap-3'>
      <Store className='h-5 w-5 text-gray-400 shrink-0 mt-0.5' />
      <div className='min-w-0 flex-1'>
        <p className='text-sm text-gray-500'>対象店舗</p>
        <div className='text-sm text-gray-900 flex flex-wrap gap-x-1'>
          {stores.map((storeKey, index) => {
            const storeName = STORE_NAME_LABELS[storeKey as StoreKey] || storeKey
            return (
              <span key={storeKey}>
                <Link to='/location' search={{ id: storeKey }} className='text-pink-600 hover:underline'>
                  {storeName}
                </Link>
                {index < stores.length - 1 && <span>、</span>}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/**
 * 限定数セクション
 */
const EventLimitedQuantitySection = ({ event }: { event: Event }) => {
  if (!event.limitedQuantity || event.conditions.some((c) => c.type === 'everyone')) return null

  return (
    <div className='flex items-start gap-3'>
      <Package className='h-5 w-5 text-gray-400 shrink-0 mt-0.5' />
      <div className='min-w-0 flex-1'>
        <p className='text-sm text-gray-500'>限定数</p>
        <p className='text-sm text-gray-900'>{event.limitedQuantity.toLocaleString()}個</p>
      </div>
    </div>
  )
}

/**
 * 配布条件セクション
 */
const EventConditionsSection = ({ conditions }: { conditions: Event['conditions'] }) => (
  <div className='flex items-start gap-3'>
    <Gift className='h-5 w-5 text-gray-400 shrink-0 mt-0.5' />
    <div className='min-w-0 flex-1'>
      <p className='text-sm text-gray-500'>配布条件</p>
      <div className='space-y-1'>
        {conditions.map((condition, index) => (
          <div key={index} className='text-sm text-gray-900'>
            • {getConditionDetail(condition)}
          </div>
        ))}
      </div>
    </div>
  </div>
)

/**
 * 参考URLセクション
 */
const EventReferenceUrlsSection = ({ referenceUrls }: { referenceUrls?: Event['referenceUrls'] }) => {
  if (!referenceUrls || referenceUrls.length === 0) return null

  return (
    <div className='flex items-start gap-3'>
      <Link2 className='h-5 w-5 text-gray-400 shrink-0 mt-0.5' />
      <div className='min-w-0 flex-1'>
        <p className='text-sm text-gray-500'>参考URL</p>
        <div className='space-y-1'>
          {referenceUrls.map((ref) => (
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
  )
}

/**
 * イベント情報セクションのコンポーネント
 */
export const EventDetailInfo = ({ event }: EventDetailInfoProps) => (
  <div className='space-y-3'>
    <h2 className='text-xl font-bold text-gray-900'>イベント情報</h2>
    <div className='space-y-3'>
      <EventPeriodSection event={event} />
      <EventStoresSection stores={event.stores ?? []} />
      <EventLimitedQuantitySection event={event} />
      <EventConditionsSection conditions={event.conditions} />
      <EventReferenceUrlsSection referenceUrls={event.referenceUrls} />
    </div>
  </div>
)
