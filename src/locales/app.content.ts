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
import { type Region, RegionSchema, StoreKeySchema } from '@/schemas/store.dto'

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
    },
    region: {
      [RegionSchema.enum.all]: '全国',
      [RegionSchema.enum.hokkaido]: '北海道',
      [RegionSchema.enum.kanto]: '関東',
      [RegionSchema.enum.chubu]: '中部',
      [RegionSchema.enum.kansai]: '関西',
      [RegionSchema.enum.kyushu]: '九州'
    },
    store_name: {
      [StoreKeySchema.enum.abeno]: 'あべのキューズモール店',
      [StoreKeySchema.enum.akasaka]: '赤坂見附駅店',
      [StoreKeySchema.enum.akiba]: 'AKIBA',
      [StoreKeySchema.enum.bicqlo]: '新宿東口店',
      [StoreKeySchema.enum.chiba]: '千葉駅前店',
      [StoreKeySchema.enum.chofu]: '京王調布店',
      [StoreKeySchema.enum.fujisawa]: '藤沢店',
      [StoreKeySchema.enum.funabashi]: '船橋駅FACE店',
      [StoreKeySchema.enum.hachioji]: 'JR八王子駅店',
      [StoreKeySchema.enum.hamamatsu]: '浜松店',
      [StoreKeySchema.enum.hiroshima]: '広島駅前店',
      [StoreKeySchema.enum.honten]: '池袋本店',
      [StoreKeySchema.enum.ikenishi]: '池袋西口店',
      [StoreKeySchema.enum.kagoshima]: '鹿児島中央駅店',
      [StoreKeySchema.enum.kashiwa]: '柏店',
      [StoreKeySchema.enum.kawasaki]: 'ラゾーナ川崎店',
      [StoreKeySchema.enum.mito]: '水戸駅店',
      [StoreKeySchema.enum.nagoya]: '名古屋駅西店',
      [StoreKeySchema.enum.nagoyagate]: '名古屋JRゲートタワー店',
      [StoreKeySchema.enum.nanba]: 'なんば店',
      [StoreKeySchema.enum.niigata]: '新潟店',
      [StoreKeySchema.enum.ohmiya]: '大宮西口そごう店',
      [StoreKeySchema.enum.okayama]: '岡山駅前店',
      [StoreKeySchema.enum.pkan]: '池袋カメラ・パソコン館',
      [StoreKeySchema.enum.sagami]: '相模大野駅店',
      [StoreKeySchema.enum.sapporo]: '札幌店',
      [StoreKeySchema.enum.shibuhachi]: '渋谷ハチ公口店',
      [StoreKeySchema.enum.shibuto]: '渋谷東口店',
      [StoreKeySchema.enum.shinjyuku]: '新宿西口店',
      [StoreKeySchema.enum.shintou]: '新宿東口駅前店',
      [StoreKeySchema.enum.shinyoko]: '新横浜店',
      [StoreKeySchema.enum.tachikawa]: '立川店',
      [StoreKeySchema.enum.takatsuki]: '高槻阪急スクエア店',
      [StoreKeySchema.enum.tenjin]: '天神1号館',
      [StoreKeySchema.enum.tenjin2]: '天神2号館',
      [StoreKeySchema.enum.tokorozawa]: '所沢駅店',
      [StoreKeySchema.enum.yao]: 'アリオ八尾店',
      [StoreKeySchema.enum.yuurakuchou]: '有楽町店'
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
export const REGION_LABELS = appContent.content.region as Record<Region, string>
export const STORE_NAME_LABELS = appContent.content.store_name
