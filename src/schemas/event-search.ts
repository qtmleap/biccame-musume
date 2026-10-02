import { z } from 'zod'
import { EventCategorySchema } from '@/schemas/event.dto'
import { RegionSchema, StoreKeySchema } from '@/schemas/store.dto'

export const DEFAULT_EVENT_CATEGORY = EventCategorySchema.options.join(',')
export const DEFAULT_EVENT_STATUS = 'upcoming,ongoing'
export const EVENT_FILTER_STATUSES = ['upcoming', 'ongoing', 'ended'] as const

// 空文字は「選択なし」。不正な値は条件全体を安全な既定値に戻す。
const selection = (options: readonly string[], fallback: string) =>
  z
    .string()
    .refine((value) => value === '' || value.split(',').every((item) => options.includes(item)))
    .default(fallback)
    .catch(fallback)
const activityFlag = z
  .union([z.boolean(), z.enum(['true', 'false']).transform((value) => value === 'true')])
  .default(false)
  .catch(false)

// 他の導線や計測用のsearch値も、絞り込み・ページ変更時に保持する。
export const EventSearchSchema = z.looseObject({
  category: selection(EventCategorySchema.options, DEFAULT_EVENT_CATEGORY),
  status: selection(EVENT_FILTER_STATUSES, DEFAULT_EVENT_STATUS),
  region: RegionSchema.default('all').catch('all'),
  store: StoreKeySchema.optional().catch(undefined),
  page: z
    .union([
      z.number(),
      z
        .string()
        .regex(/^[1-9]\d*$/)
        .transform(Number)
    ])
    .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER))
    .default(1)
    .catch(1),
  hideInterested: activityFlag,
  hideCompleted: activityFlag
})
