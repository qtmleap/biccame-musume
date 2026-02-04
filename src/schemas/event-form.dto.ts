import { z } from 'zod'
import { EventCategorySchema, ReferenceUrlTypeSchema } from './event.dto'

/**
 * イベントフォームのスキーマ定義（日付をstring型で扱う）
 */
export const EventFormSchema = z.object({
  // 重複作成を防ぐためにクライアント側で生成したid（新規作成時のみ）
  uuid: z.uuidv4(),
  category: EventCategorySchema,
  name: z.string().nonempty('イベント名は必須です'),
  stores: z.array(z.string()).nonempty('最低1つの店舗を選択してください'),
  startDate: z.string().nonempty('開始日は必須です'),
  endDate: z.string().nullable().optional(),
  endedAt: z.string().nullable().optional(),
  limitedQuantity: z.number().min(1).optional(),
  referenceUrls: z.array(
    z.object({
      uuid: z.uuidv4(),
      type: ReferenceUrlTypeSchema,
      url: z.url('有効なURLを入力してください')
    })
  ),
  conditions: z
    .array(
      z.object({
        uuid: z.uuidv4(),
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
