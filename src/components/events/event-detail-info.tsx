import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { Calendar, Gift, Link2, Package, Store } from 'lucide-react'
import { motion } from 'motion/react'
import { DURATION } from '@/lib/motion'
import { EVENT_LABELS, REFERENCE_URL_TYPE_LABELS_LONG, STORE_NAME_LABELS } from '@/locales/app.content'
import type { Event } from '@/schemas/event.dto'
import type { StoreKey } from '@/schemas/store.dto'

export type EventDetailInfoProps = {
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
      return condition.quantity
        ? EVENT_LABELS.firstComeWithCount.replace('{count}', condition.quantity.toString())
        : EVENT_LABELS.firstCome
    case 'lottery':
      return condition.quantity
        ? EVENT_LABELS.lotteryWithCount.replace('{count}', condition.quantity.toString())
        : EVENT_LABELS.lottery
    case 'everyone':
      return EVENT_LABELS.everyone
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
      <Calendar className='h-5 w-5 text-muted-foreground/50 shrink-0 mt-0.5' />
      <div className='min-w-0 flex-1'>
        <p className='text-sm text-muted-foreground'>開催期間</p>
        <p className='text-sm text-foreground'>
          {startDate.format('YYYY年M月D日')}
          {endDate ? ` 〜 ${endDate.format('YYYY年M月D日')}` : ' 〜 なくなり次第終了'}
        </p>
        {event.endedAt && (
          <p className='text-xs text-muted-foreground mt-0.5'>
            実際の終了: {dayjs(event.endedAt).format('YYYY年M月D日')}
          </p>
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
      <Store className='h-5 w-5 text-muted-foreground/50 shrink-0 mt-0.5' />
      <div className='min-w-0 flex-1'>
        <p className='text-sm text-muted-foreground'>対象店舗</p>
        <div className='text-sm text-foreground flex flex-wrap gap-x-1'>
          {stores.map((storeKey, index) => {
            const storeName = STORE_NAME_LABELS[storeKey as StoreKey] || storeKey
            return (
              <span key={storeKey} className='flex items-center gap-1'>
                <Link to='/characters/$id' params={{ id: storeKey }} className='text-brand hover:underline'>
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
      <Package className='h-5 w-5 text-muted-foreground/50 shrink-0 mt-0.5' />
      <div className='min-w-0 flex-1'>
        <p className='text-sm text-muted-foreground'>限定数</p>
        <p className='text-sm text-foreground'>{event.limitedQuantity.toLocaleString()}個</p>
      </div>
    </div>
  )
}

/**
 * 配布条件セクション
 */
const EventConditionsSection = ({ conditions }: { conditions: Event['conditions'] }) => (
  <div className='flex items-start gap-3'>
    <Gift className='h-5 w-5 text-muted-foreground/50 shrink-0 mt-0.5' />
    <div className='min-w-0 flex-1'>
      <p className='text-sm text-muted-foreground'>配布条件</p>
      <div className='space-y-1'>
        {conditions.map((condition) => (
          <div key={condition.uuid} className='text-sm text-foreground'>
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
      <Link2 className='h-5 w-5 text-muted-foreground/50 shrink-0 mt-0.5' />
      <div className='min-w-0 flex-1'>
        <p className='text-sm text-muted-foreground'>参考URL</p>
        <div className='space-y-1'>
          {referenceUrls.map((ref) => (
            <div key={ref.url}>
              <a
                href={ref.url}
                target='_blank'
                rel='noopener noreferrer'
                className='text-sm text-brand hover:underline'
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
  <motion.div
    key={`info-${event.uuid}`}
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ duration: DURATION.normal, delay: 0.3 }}
    className='space-y-3'
  >
    <h2 className='text-xl font-bold text-foreground'>イベント情報</h2>
    <div className='space-y-3'>
      <EventPeriodSection event={event} />
      <EventStoresSection stores={event.stores ?? []} />
      <EventLimitedQuantitySection event={event} />
      <EventConditionsSection conditions={event.conditions} />
      <EventReferenceUrlsSection referenceUrls={event.referenceUrls} />
    </div>
  </motion.div>
)
