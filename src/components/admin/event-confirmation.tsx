import dayjs from 'dayjs'
import { v4 as uuidv4 } from 'uuid'
import { EventDetailInfo } from '@/components/events/event-detail-info'
import { Button } from '@/components/ui/button'
import type { Event } from '@/schemas/event.dto'
import type { EventFormValues } from '@/schemas/event-form.dto'
import type { StoreKey } from '@/schemas/store.dto'

type EventConfirmationProps = {
  data: EventFormValues
  isSubmitting: boolean
  onBack: () => void
  onSubmit: () => void
}

/**
 * イベント登録内容の確認画面コンポーネント
 */
export const EventConfirmation = ({ data, isSubmitting, onBack, onSubmit }: EventConfirmationProps) => {
  // EventFormValuesをEvent型に変換
  const previewEvent: Event = {
    id: 'preview',
    category: data.category,
    name: data.name,
    stores: data.stores as StoreKey[],
    startDate: dayjs(data.startDate).toDate(),
    endDate: data.endDate ? dayjs(data.endDate).toDate() : undefined,
    endedAt: data.endedAt ? dayjs(data.endedAt).toDate() : undefined,
    limitedQuantity: data.limitedQuantity,
    referenceUrls: data.referenceUrls.map((v) => ({
      ...v,
      id: v.id || uuidv4()
    })),
    conditions: data.conditions.map((c) => ({
      ...c,
      id: c.id || uuidv4()
    })),
    isVerified: data.isVerified,
    isPreliminary: data.isPreliminary,
    status: 'upcoming' as const,
    daysUntil: dayjs(data.startDate).diff(dayjs(), 'day'),
    createdAt: dayjs().toDate(),
    updatedAt: dayjs().toDate()
  }

  return (
    <div className='space-y-6'>
      {/* イベント情報 */}
      <EventDetailInfo event={previewEvent} />

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
