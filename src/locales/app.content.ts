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
import { type Region, RegionSchema, type StoreKey, StoreKeySchema } from '@/schemas/store.dto'

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
      [StoreKeySchema.enum.biccamera]: 'ビックカメラ',
      [StoreKeySchema.enum.bicqlo]: '新宿東口店',
      [StoreKeySchema.enum.bicsim]: 'ビックシム',
      [StoreKeySchema.enum.camera]: 'カメラ',
      [StoreKeySchema.enum.chiba]: '千葉駅前店',
      [StoreKeySchema.enum.chofu]: '京王調布店',
      [StoreKeySchema.enum.fujisawa]: '藤沢店',
      [StoreKeySchema.enum.funabashi]: '船橋駅FACE店',
      [StoreKeySchema.enum.funato]: '船渡店',
      [StoreKeySchema.enum.hachioji]: 'JR八王子駅店',
      [StoreKeySchema.enum.hamamatsu]: '浜松店',
      [StoreKeySchema.enum.hiroshima]: '広島駅前店',
      [StoreKeySchema.enum.honten]: '池袋本店',
      [StoreKeySchema.enum.ikenishi]: '池袋西口店',
      [StoreKeySchema.enum.kagoshima]: '鹿児島中央駅店',
      [StoreKeySchema.enum.kashiwa]: '柏店',
      [StoreKeySchema.enum.kawasaki]: 'ラゾーナ川崎店',
      [StoreKeySchema.enum.kyoto]: '京都店',
      [StoreKeySchema.enum.machida]: '町田店',
      [StoreKeySchema.enum.mito]: '水戸駅店',
      [StoreKeySchema.enum.nagoya]: '名古屋駅西店',
      [StoreKeySchema.enum.nagoyagate]: '名古屋JRゲートタワー店',
      [StoreKeySchema.enum.naisen]: 'ナイセン',
      [StoreKeySchema.enum.nanba]: 'なんば店',
      [StoreKeySchema.enum.niigata]: '新潟店',
      [StoreKeySchema.enum.oeraitan]: 'お偉いたん',
      [StoreKeySchema.enum.ohmiya]: '大宮西口そごう店',
      [StoreKeySchema.enum.okayama]: '岡山駅前店',
      [StoreKeySchema.enum.photo]: 'フォト',
      [StoreKeySchema.enum.pkan]: '池袋本店パソコン館',
      [StoreKeySchema.enum.prosta]: 'プロスタ',
      [StoreKeySchema.enum.sagami]: '相模大野駅店',
      [StoreKeySchema.enum.sapporo]: '札幌店',
      [StoreKeySchema.enum.seiseki]: '聖蹟桜ヶ丘駅店',
      [StoreKeySchema.enum.shibuhachi]: '渋谷ハチ公口店',
      [StoreKeySchema.enum.shibuto]: '渋谷東口店',
      [StoreKeySchema.enum.shinjyuku]: '新宿西口店',
      [StoreKeySchema.enum.shintou]: '新宿東口駅前店',
      [StoreKeySchema.enum.shinyoko]: '新横浜店',
      [StoreKeySchema.enum.tachikawa]: '立川店',
      [StoreKeySchema.enum.takatsuki]: '高槻阪急スクエア店',
      [StoreKeySchema.enum.tamapla]: '多摩プラーザ店',
      [StoreKeySchema.enum.tenjin]: '天神1号館',
      [StoreKeySchema.enum.tenjin2]: '天神2号館',
      [StoreKeySchema.enum.tokorozawa]: '所沢駅店',
      [StoreKeySchema.enum.yao]: 'アリオ八尾店',
      [StoreKeySchema.enum.yokonishi]: '横浜西口店',
      [StoreKeySchema.enum.yuurakuchou]: '有楽町店'
    },
    character_name: {
      [StoreKeySchema.enum.abeno]: 'あべのたん',
      [StoreKeySchema.enum.akasaka]: 'みっけたん',
      [StoreKeySchema.enum.akiba]: 'アキバたん',
      [StoreKeySchema.enum.biccamera]: 'ビックカメラ',
      [StoreKeySchema.enum.bicqlo]: 'しんじゅくたん',
      [StoreKeySchema.enum.bicsim]: 'ビックシムたん',
      [StoreKeySchema.enum.camera]: 'カメ館たん',
      [StoreKeySchema.enum.chiba]: '千葉たん',
      [StoreKeySchema.enum.chofu]: '調布たん',
      [StoreKeySchema.enum.fujisawa]: '藤沢たん',
      [StoreKeySchema.enum.funabashi]: 'ふなたん',
      [StoreKeySchema.enum.funato]: 'ふなとーたん',
      [StoreKeySchema.enum.hachioji]: '八王子たん',
      [StoreKeySchema.enum.hamamatsu]: 'はまたん',
      [StoreKeySchema.enum.hiroshima]: '広島たん',
      [StoreKeySchema.enum.honten]: '本店たん',
      [StoreKeySchema.enum.ikenishi]: '池西たん',
      [StoreKeySchema.enum.kagoshima]: '鹿児島たん',
      [StoreKeySchema.enum.kashiwa]: '柏たん',
      [StoreKeySchema.enum.kawasaki]: '川崎たん',
      [StoreKeySchema.enum.kyoto]: '京都たん',
      [StoreKeySchema.enum.machida]: '町田たん',
      [StoreKeySchema.enum.mito]: '水戸たん',
      [StoreKeySchema.enum.nagoya]: 'なごやたん',
      [StoreKeySchema.enum.nagoyagate]: 'なごやげーとたん',
      [StoreKeySchema.enum.naisen]: 'ナイセン',
      [StoreKeySchema.enum.nanba]: 'なんばたん',
      [StoreKeySchema.enum.niigata]: 'にいがたたん',
      [StoreKeySchema.enum.oeraitan]: 'お偉いたん',
      [StoreKeySchema.enum.ohmiya]: '大宮たん',
      [StoreKeySchema.enum.okayama]: '岡山たん',
      [StoreKeySchema.enum.photo]: 'フォトたん',
      [StoreKeySchema.enum.pkan]: 'パソ館たん',
      [StoreKeySchema.enum.prosta]: 'プロスタたん',
      [StoreKeySchema.enum.sagami]: 'さがみたん',
      [StoreKeySchema.enum.sapporo]: 'さっぽろたん',
      [StoreKeySchema.enum.seiseki]: 'せいせきたん',
      [StoreKeySchema.enum.shibuhachi]: 'しぶハチたん',
      [StoreKeySchema.enum.shibuto]: 'しぶとーたん',
      [StoreKeySchema.enum.shinjyuku]: '新宿西口たん',
      [StoreKeySchema.enum.shintou]: '新東たん',
      [StoreKeySchema.enum.shinyoko]: '新横たん',
      [StoreKeySchema.enum.tachikawa]: '立川たん',
      [StoreKeySchema.enum.takatsuki]: 'たかつきたん',
      [StoreKeySchema.enum.tamapla]: 'たまプラたん',
      [StoreKeySchema.enum.tenjin]: '天神1号たん',
      [StoreKeySchema.enum.tenjin2]: '天神2号たん',
      [StoreKeySchema.enum.tokorozawa]: '所沢たん',
      [StoreKeySchema.enum.yao]: '八尾たん',
      [StoreKeySchema.enum.yokonishi]: '横西たん',
      [StoreKeySchema.enum.yuurakuchou]: '有楽町たん'
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
export const CHARACTER_NAME_LABELS = appContent.content.character_name as Record<StoreKey, string>
