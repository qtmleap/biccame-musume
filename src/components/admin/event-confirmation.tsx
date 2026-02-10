import dayjs from 'dayjs'
import { EventDetailInfo } from '@/components/events/event-detail-info'
import { Button } from '@/components/ui/button'
import type { Event, EventRequest, EventStatus } from '@/schemas/event.dto'
import type { StoreKey } from '@/schemas/store.dto'

type EventConfirmationProps = {
  data: EventRequest
  isSubmitting: boolean
  onBack: () => void
  onSubmit: () => void
}

/**
 * イベント登録内容の確認画面コンポーネント
 */
export const EventConfirmation = ({ data, isSubmitting, onBack, onSubmit }: EventConfirmationProps) => {
  // EventRequestをEvent型に変換
  const event: Event = {
    uuid: data.uuid,
    category: data.category,
    title: data.title,
    stores: data.stores as StoreKey[],
    startDate: dayjs(data.startDate).toDate(),
    endDate: data.endDate ? dayjs(data.endDate).toDate() : undefined,
    endedAt: data.endedAt ? dayjs(data.endedAt).toDate() : undefined,
    limitedQuantity: data.limitedQuantity,
    referenceUrls: data.referenceUrls,
    conditions: data.conditions,
    isVerified: data.isVerified,
    isPreliminary: data.isPreliminary,
    status: 'upcoming' as EventStatus,
    daysUntil: dayjs(data.startDate).diff(dayjs(), 'day'),
    interestedCount: 0,
    completedCount: 0,
    createdAt: dayjs().toDate(),
    updatedAt: dayjs().toDate()
  }

  return (
    <div className='space-y-6'>
      {/* イベント情報 */}
      <EventDetailInfo event={event} />

      {/* 投稿通知 */}
      {data.shouldTweet && <p className='text-base font-medium text-sky-600 text-center'>保存すると投稿されます</p>}

      {/* ボタン */}
      <div className='flex gap-2 max-w-md mx-auto'>
        <Button type='button' onClick={onBack} variant='outline' className='flex-1' disabled={isSubmitting}>
          修正する
        </Button>
        <Button
          type='button'
          onClick={onSubmit}
          className='flex-1 bg-blue-600 hover:bg-blue-700'
          disabled={isSubmitting}
        >
          {isSubmitting ? '登録中...' : '登録する'}
        </Button>
      </div>
    </div>
  )
}
