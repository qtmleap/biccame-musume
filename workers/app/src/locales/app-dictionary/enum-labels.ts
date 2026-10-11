import {
  EventCategorySchema,
  EventConditionTypeSchema,
  EventStatusSchema,
  ReferenceUrlTypeSchema
} from '@/schemas/event.dto'
import { RegionSchema } from '@/schemas/store.dto'

export const enumContent = {
  status: {
    [EventStatusSchema.enum.upcoming]: '開催前',
    [EventStatusSchema.enum.ongoing]: '開催中',
    [EventStatusSchema.enum.last_day]: '最終日',
    [EventStatusSchema.enum.ended]: '終了'
  },
  category: {
    [EventCategorySchema.enum.limited_card]: '限定名刺',
    [EventCategorySchema.enum.regular_card]: '通年名刺',
    [EventCategorySchema.enum.ackey]: 'アクキー',
    [EventCategorySchema.enum.acsta]: 'アクスタ',
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
  },
  region: {
    [RegionSchema.enum.all]: '全国',
    [RegionSchema.enum.hokkaido]: '北海道',
    [RegionSchema.enum.kanto]: '関東',
    [RegionSchema.enum.chubu]: '中部',
    [RegionSchema.enum.kansai]: '関西',
    [RegionSchema.enum.kyushu]: '九州'
  }
}
