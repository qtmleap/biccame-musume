import { z } from 'zod'
import { EventSchema } from './event.dto'

/**
 * イベントグループ作成・更新リクエスト
 */
export const EventGroupRequestSchema = z.object({
  uuid: z.uuid(),
  title: z.string().nonempty('グループ名は必須です'),
  description: z.string().optional(),
  startDate: z.string().nonempty('開始日は必須です'),
  endDate: z.string().nonempty('終了日は必須です').optional(),
  sortOrder: z.number({ error: '並び順は数値で入力してください' }).int().nonnegative()
})
export type EventGroupRequest = z.infer<typeof EventGroupRequestSchema>

/**
 * イベントグループ（一覧 / 基本情報）
 */
export const EventGroupSchema = z.object({
  uuid: z.uuid(),
  title: z.string().nonempty(),
  description: z.string().optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  sortOrder: z.number().int().nonnegative(),
  eventCount: z.number().int().nonnegative(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
})
export type EventGroup = z.infer<typeof EventGroupSchema>

/**
 * イベントグループ詳細（紐付く Event 一覧を含む）
 */
export const EventGroupDetailSchema = EventGroupSchema.extend({
  events: z.array(EventSchema)
})
export type EventGroupDetail = z.infer<typeof EventGroupDetailSchema>
