import dayjs from 'dayjs'
import type { DefaultValues } from 'react-hook-form'
import { v4 as uuidv4 } from 'uuid'
import type { useEventOrNull } from '@/hooks/use-events'
import type { EventCategory, EventRequest, EventRequestQuery } from '@/schemas/event.dto'
import type { StoreKey } from '@/schemas/store.dto'

export const DEFAULT_VALUES: DefaultValues<EventRequest> = {
  category: undefined,
  title: '',
  referenceUrls: [],
  stores: [],
  limitedQuantity: undefined,
  startDate: '',
  endDate: undefined,
  endedAt: undefined,
  conditions: [],
  isVerified: true,
  isPreliminary: false,
  shouldTweet: true,
  uuid: undefined
}

export const toFormValues = (
  event: NonNullable<ReturnType<typeof useEventOrNull>['data']>
): DefaultValues<EventRequest> => ({
  uuid: event.uuid,
  category: event.category,
  title: event.title,
  referenceUrls: event.referenceUrls || [],
  stores: event.stores || [],
  limitedQuantity: event.limitedQuantity,
  startDate: dayjs(event.startDate).format('YYYY-MM-DD'),
  endDate: event.endDate ? dayjs(event.endDate).format('YYYY-MM-DD') : undefined,
  endedAt: event.endedAt ? dayjs(event.endedAt).format('YYYY-MM-DD') : undefined,
  conditions: event.conditions,
  isVerified: event.isVerified ?? false,
  isPreliminary: event.isPreliminary ?? false,
  shouldTweet: false
})

export const toFormValuesFromQuery = (search: EventRequestQuery, uuid: string): DefaultValues<EventRequest> => ({
  uuid,
  category: search.category as EventCategory,
  title: search.title,
  stores: search.stores ? (search.stores.split(',').map((s) => s.trim()) as StoreKey[]) : undefined,
  referenceUrls: search.referenceUrls
    ? search.referenceUrls.split(',').map((url) => ({
        uuid: uuidv4(),
        type: 'announce' as const,
        url: url.trim()
      }))
    : undefined,
  startDate: search.startDate,
  endDate: search.endDate,
  endedAt: search.endAt,
  shouldTweet: Object.keys(search).length > 0 ? false : undefined
})

export const buildInitialValues = (defaultValues?: DefaultValues<EventRequest>): DefaultValues<EventRequest> => {
  if (defaultValues) {
    return {
      ...DEFAULT_VALUES,
      ...defaultValues,
      startDate: defaultValues.startDate ? dayjs(defaultValues.startDate).format('YYYY-MM-DD') : '',
      endDate: defaultValues.endDate ? dayjs(defaultValues.endDate).format('YYYY-MM-DD') : undefined,
      endedAt: defaultValues.endedAt ? dayjs(defaultValues.endedAt).format('YYYY-MM-DD') : undefined,
      isVerified: defaultValues.isVerified ?? false,
      isPreliminary: defaultValues.isPreliminary ?? false,
      shouldTweet: defaultValues.shouldTweet ?? false,
      uuid: defaultValues.uuid || uuidv4()
    }
  }

  return {
    ...DEFAULT_VALUES,
    uuid: uuidv4()
  }
}

export const toEventPayload = (
  data: EventRequest,
  opts: { isEditMode: boolean; fallbackUuid?: string }
): EventRequest => ({
  category: data.category,
  title: data.title,
  startDate: dayjs(data.startDate).toISOString(),
  conditions: data.conditions.map((c) => ({
    uuid: c.uuid || uuidv4(),
    type: c.type,
    purchaseAmount: c.purchaseAmount,
    quantity: c.quantity
  })) as EventRequest['conditions'],
  stores: data.stores as EventRequest['stores'],
  isVerified: data.isVerified,
  isPreliminary: data.isPreliminary,
  shouldTweet: data.shouldTweet,
  uuid: opts.isEditMode && opts.fallbackUuid ? opts.fallbackUuid : data.uuid || uuidv4(),
  endDate: data.endDate && data.endDate.trim() !== '' ? dayjs(data.endDate).toISOString() : undefined,
  endedAt: data.endedAt && data.endedAt.trim() !== '' ? dayjs(data.endedAt).toISOString() : undefined,
  referenceUrls: (data.referenceUrls && data.referenceUrls.length > 0
    ? data.referenceUrls.map((r) => ({
        uuid: r.uuid || uuidv4(),
        type: r.type,
        url: r.url
      }))
    : data.referenceUrls) as EventRequest['referenceUrls'],
  limitedQuantity: data.limitedQuantity || undefined
})
