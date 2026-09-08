import dayjs from 'dayjs'
import type { DefaultValues } from 'react-hook-form'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import type { useEventOrNull } from '@/hooks/use-events'
import {
  type EventCategory,
  EventCharacterSchema,
  type EventRequest,
  type EventRequestQuery,
  EventRequestSchema
} from '@/schemas/event.dto'
import type { StoreKey } from '@/schemas/store.dto'

/**
 * react-hook-form は値が undefined のときマウント時の初期値をフォールバックとして返すため、
 * 未入力を undefined で表すとクリア操作が初期値の復活として現れる。
 * フォーム上は空文字を未入力として扱い、送信直前に toEventPayload で undefined へ畳む。
 */
export const EventFormSchema = EventRequestSchema.extend({
  endDate: z.union([z.literal(''), z.string().nonempty('終了日は必須です')]),
  endedAt: z.union([z.literal(''), z.string().nonempty('終了日時は必須です')]),
  groupId: z.union([z.literal(''), z.uuid('グループ ID は UUID 形式で指定してください')]),
  characterId: z.union([z.literal(''), EventCharacterSchema])
})
export type EventFormValues = z.infer<typeof EventFormSchema>

export const DEFAULT_VALUES: DefaultValues<EventFormValues> = {
  category: undefined,
  title: '',
  referenceUrls: [],
  stores: [],
  limitedQuantity: undefined,
  startDate: '',
  endDate: '',
  endedAt: '',
  conditions: [],
  isVerified: true,
  isPreliminary: false,
  groupId: '',
  characterId: '',
  shouldTweet: true,
  uuid: undefined
}

export const toFormValues = (
  event: NonNullable<ReturnType<typeof useEventOrNull>['data']>
): DefaultValues<EventFormValues> => ({
  uuid: event.uuid,
  category: event.category,
  title: event.title,
  referenceUrls: event.referenceUrls ? event.referenceUrls : [],
  stores: event.stores ? event.stores : [],
  limitedQuantity: event.limitedQuantity,
  startDate: dayjs(event.startDate).format('YYYY-MM-DD'),
  endDate: event.endDate ? dayjs(event.endDate).format('YYYY-MM-DD') : '',
  endedAt: event.endedAt ? dayjs(event.endedAt).format('YYYY-MM-DD') : '',
  conditions: event.conditions,
  isVerified: event.isVerified ?? false,
  isPreliminary: event.isPreliminary ?? false,
  groupId: event.groupId ? event.groupId : '',
  characterId: event.characterId ? event.characterId : '',
  shouldTweet: false
})

export const toCopyFormValues = (
  event: NonNullable<ReturnType<typeof useEventOrNull>['data']>,
  newUuid: string
): DefaultValues<EventFormValues> => ({
  ...toFormValues(event),
  uuid: newUuid,
  conditions: event.conditions.map((c) => ({ ...c, uuid: uuidv4() })),
  referenceUrls: (event.referenceUrls ? event.referenceUrls : []).map((r) => ({ ...r, uuid: uuidv4() })),
  endedAt: '',
  shouldTweet: true
})

export const toFormValuesFromQuery = (search: EventRequestQuery, uuid: string): DefaultValues<EventFormValues> => ({
  uuid,
  category: search.category as EventCategory,
  title: search.title ? search.title : '',
  stores: search.stores ? (search.stores.split(',').map((s) => s.trim()) as StoreKey[]) : [],
  referenceUrls: search.referenceUrls
    ? search.referenceUrls.split(',').map((url) => ({
        uuid: uuidv4(),
        type: 'announce' as const,
        url: url.trim()
      }))
    : [],
  startDate: search.startDate ? search.startDate : '',
  endDate: search.endDate ? search.endDate : '',
  endedAt: search.endAt ? search.endAt : ''
})

export const buildInitialValues = (defaultValues?: DefaultValues<EventFormValues>): DefaultValues<EventFormValues> => {
  if (defaultValues) {
    return {
      ...DEFAULT_VALUES,
      ...defaultValues,
      startDate: defaultValues.startDate ? dayjs(defaultValues.startDate).format('YYYY-MM-DD') : '',
      endDate: defaultValues.endDate ? dayjs(defaultValues.endDate).format('YYYY-MM-DD') : '',
      endedAt: defaultValues.endedAt ? dayjs(defaultValues.endedAt).format('YYYY-MM-DD') : '',
      uuid: defaultValues.uuid ? defaultValues.uuid : uuidv4()
    }
  }

  return {
    ...DEFAULT_VALUES,
    uuid: uuidv4()
  }
}

export const toEventPayload = (
  data: EventFormValues,
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
  groupId: data.groupId === '' ? undefined : data.groupId,
  characterId: data.characterId === '' ? undefined : data.characterId,
  shouldTweet: data.shouldTweet,
  uuid: opts.isEditMode && opts.fallbackUuid ? opts.fallbackUuid : data.uuid ? data.uuid : uuidv4(),
  endDate: data.endDate.trim() === '' ? undefined : dayjs(data.endDate).toISOString(),
  endedAt: data.endedAt.trim() === '' ? undefined : dayjs(data.endedAt).toISOString(),
  referenceUrls: (data.referenceUrls && data.referenceUrls.length > 0
    ? data.referenceUrls.map((r) => ({
        uuid: r.uuid || uuidv4(),
        type: r.type,
        url: r.url
      }))
    : data.referenceUrls) as EventRequest['referenceUrls'],
  limitedQuantity: data.limitedQuantity || undefined
})
