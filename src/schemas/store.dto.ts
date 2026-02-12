import { z } from 'zod'
import { prefectureToRegion } from '@/atoms/filter-atom'

/**
 * 地域の型定義
 */
export const RegionSchema = z.enum(['all', 'hokkaido', 'kanto', 'chubu', 'kansai', 'kyushu'])

export type Region = z.infer<typeof RegionSchema>

/**
 * 店舗キーの型定義
 */
export const StoreKeySchema = z.enum([
  'abeno',
  'akasaka',
  'akiba',
  'biccamera',
  'bicqlo',
  'bicsim',
  'camera',
  'chiba',
  'chofu',
  'fujisawa',
  'funabashi',
  'funato',
  'hachioji',
  'hamamatsu',
  'hiroshima',
  'honten',
  'ikenishi',
  'kagoshima',
  'kashiwa',
  'kawasaki',
  'kumamoto',
  'kyoto',
  'machida',
  'mito',
  'nagoya',
  'nagoyagate',
  'naisen',
  'nanba',
  'niigata',
  'oeraitan',
  'ohmiya',
  'okayama',
  'photo',
  'pkan',
  'prosta',
  'sagami',
  'sapporo',
  'seiseki',
  'shibuhachi',
  'shibuto',
  'shinjyuku',
  'shintou',
  'shinyoko',
  'tachikawa',
  'takatsuki',
  'tamapla',
  'tenjin',
  'tenjin2',
  'tokorozawa',
  'yao',
  'yokonishi',
  'yuurakuchou'
])

export type StoreKey = z.infer<typeof StoreKeySchema>

/**
 * 営業時間の型定義
 */
export const HoursSchema = z.object({
  type: z.enum(['weekday', 'weekend', 'holiday', 'all']),
  open_time: z.string().nonempty(),
  close_time: z.string().nonempty(),
  note: z.string().nonempty().optional()
})

export type Hours = z.infer<typeof HoursSchema>

/**
 * アクセス情報の型定義
 */
export const AccessInfoSchema = z.object({
  station: z.string().nonempty(),
  description: z.string(),
  duration: z.string().nonempty().optional(),
  notes: z.string().nonempty().optional(),
  lines: z.array(z.string())
})

export type AccessInfo = z.infer<typeof AccessInfoSchema>

/**
 * 座標の型定義
 */
export const CoordinatesSchema = z.object({
  latitude: z.number(),
  longitude: z.number()
})

export type Coordinates = z.infer<typeof CoordinatesSchema>

/**
 * 駐車場条件の型定義
 */
export const ParkingConditionSchema = z.object({
  purchase: z.string(),
  freeTime: z.string()
})

export type ParkingCondition = z.infer<typeof ParkingConditionSchema>

/**
 * 駐車場情報の型定義
 */
export const ParkingInfoSchema = z.object({
  name: z.string().nonempty(),
  conditions: z.array(ParkingConditionSchema)
})

export type ParkingInfo = z.infer<typeof ParkingInfoSchema>

/**
 * 店舗詳細情報の型定義
 */
export const StoreDetailsSchema = z.object({
  store_id: z.number().int().positive().optional(),
  name: z.string().nonempty().optional(),
  address: z.string().nonempty().optional(),
  phone: z.string().nonempty().optional(),
  birthday: z.string().nonempty().optional(),
  open_all_year: z.boolean().optional(),
  hours: z.array(HoursSchema).optional(),
  access: z.array(AccessInfoSchema)
})

export type StoreDetails = z.infer<typeof StoreDetailsSchema>

/**
 * キャラクター情報の型定義
 */
export const CharacterSchema = z
  .object({
    name: z.string().nonempty(),
    aliases: z.array(z.string().nonempty()).nonempty().optional(),
    description: z.string().nonempty(),
    twitter_id: z.string(),
    images: z.array(z.string().nonempty()).nonempty(),
    birthday: z.string().nonempty().optional(),
    is_biccame_musume: z.boolean().optional()
  })
  .transform((v) => ({
    ...v,
    image_url: (() => {
      const key: string = v.images.findLast((url) => url.endsWith('4.png')) || v.images[v.images.length - 1]
      return new URL(key, 'https://biccame.jp/profile/').href
    })()
  }))

export type Character = z.infer<typeof CharacterSchema>

/**
 * キャラクターと店舗情報を含むデータの型定義
 */
export const StoreDataSchema = z
  .object({
    id: z.string().nonempty(),
    character: CharacterSchema,
    prefecture: z.string().nonempty().nullable(),
    coordinates: CoordinatesSchema.optional().nullable(),
    postal_code: z.string().nonempty().optional().nullable(),
    store: StoreDetailsSchema.optional()
  })
  .transform((v) => ({
    ...v,
    region: v.prefecture ? prefectureToRegion[v.prefecture] : undefined
  }))

export type StoreData = z.infer<typeof StoreDataSchema>

/**
 * 店舗リストの型定義
 */
export const StoresSchema = z.array(StoreDataSchema).nonempty()

export type StoresData = z.infer<typeof StoresSchema>
