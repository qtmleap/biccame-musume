import { z } from 'zod'
import { EventCategorySchema, ReferenceUrlTypeSchema } from './event.dto'

/**
 * イベントフォームのスキーマ定義（日付をstring型で扱う）
 */
export const EventFormSchema = z.object({
  category: EventCategorySchema,
  name: z.string().min(1, 'イベント名は必須です'),
  stores: z.array(z.string()).min(1, '最低1つの店舗を選択してください'),
  startDate: z.string().min(1, '開始日は必須です'),
  endDate: z.string().nullable().optional(),
  endedAt: z.string().nullable().optional(),
  limitedQuantity: z.number().min(1).optional(),
  referenceUrls: z.array(
    z.object({
      id: z.string().optional(),
      type: ReferenceUrlTypeSchema,
      url: z.string().url('有効なURLを入力してください')
    })
  ),
  conditions: z
    .array(
      z.object({
        id: z.string().optional(),
        type: z.enum(['purchase', 'first_come', 'lottery', 'everyone']),
        purchaseAmount: z.number().min(0).optional(),
        quantity: z.number().min(1).optional()
      })
    )
    .min(1, '最低1つの条件を設定してください'),
  isVerified: z.boolean(),
  isPreliminary: z.boolean(),
  shouldTweet: z.boolean()
})

export type EventFormValues = z.infer<typeof EventFormSchema>
