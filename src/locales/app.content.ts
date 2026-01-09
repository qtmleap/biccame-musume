import type { Dictionary } from 'intlayer'
import {
  type EventCategory,
  EventCategorySchema,
  type EventConditionType,
  EventConditionTypeSchema,
  type EventStatus,
  EventStatusSchema,
  type ReferenceUrlType,
  ReferenceUrlTypeSchema
} from '@/schemas/event.dto'

const appContent = {
  key: 'app',
  content: {
    status: {
      [EventStatusSchema.enum.upcoming]: '開催予定',
      [EventStatusSchema.enum.ongoing]: '開催中',
      [EventStatusSchema.enum.ended]: '終了'
    },
    category: {
      [EventCategorySchema.enum.limited_card]: '限定名刺',
      [EventCategorySchema.enum.regular_card]: '通年名刺',
      [EventCategorySchema.enum.ackey]: 'アクキー',
      [EventCategorySchema.enum.other]: 'その他'
    },
    condition: {
      [EventConditionTypeSchema.enum.purchase]: '購入条件',
      [EventConditionTypeSchema.enum.first_come]: '先着順',
      [EventConditionTypeSchema.enum.lottery]: '抽選',
      [EventConditionTypeSchema.enum.everyone]: '全員配布'
    },
    ref: {
      [ReferenceUrlTypeSchema.enum.announce]: '告知',
      [ReferenceUrlTypeSchema.enum.start]: '開始',
      [ReferenceUrlTypeSchema.enum.end]: '終了'
    },
    refLong: {
      [ReferenceUrlTypeSchema.enum.announce]: '告知ツイート',
      [ReferenceUrlTypeSchema.enum.start]: '開始ツイート',
      [ReferenceUrlTypeSchema.enum.end]: '終了ツイート'
    }
  }
} satisfies Dictionary

export default appContent

// コンポーネントから使いやすいようにエクスポート
export const EVENT_STATUS_LABELS = appContent.content.status as Record<EventStatus, string>
export const EVENT_CATEGORY_LABELS = appContent.content.category as Record<EventCategory, string>
export const EVENT_CONDITION_LABELS = appContent.content.condition as Record<EventConditionType, string>
export const REFERENCE_URL_TYPE_LABELS = appContent.content.ref as Record<ReferenceUrlType, string>
export const REFERENCE_URL_TYPE_LABELS_LONG = appContent.content.refLong as Record<ReferenceUrlType, string>
