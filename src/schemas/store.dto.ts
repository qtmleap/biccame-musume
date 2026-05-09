import { z } from 'zod'
import { prefectureToRegion } from '@/atoms/filter-atom'

/**
 * 地域の型定義
 */
export const RegionSchema = z.enum(['all', 'hokkaido', 'kanto', 'chubu', 'kansai', 'kyushu'], {
  error: '有効な地域を選択してください'
})

export type Region = z.infer<typeof RegionSchema>

/**
 * 店舗キーの型定義
 */
export const StoreKeySchema = z.enum(
  [
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
    'itt',
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
    'takasaki',
    'takatsuki',
    'tamapla',
    'tenjin',
    'tenjin2',
    'tokorozawa',
    'yao',
    'yokonishi',
    'yuurakuchou'
  ],
  { error: '有効な店舗を選択してください' }
)

export type StoreKey = z.infer<typeof StoreKeySchema>

/**
 * 営業時間の型定義
 */
export const HoursSchema = z.object({
  type: z.enum(['weekday', 'weekend', 'holiday', 'all'], { error: '営業時間の種別が不正です' }),
  open_time: z.string().nonempty('開店時刻は必須です'),
  close_time: z.string().nonempty('閉店時刻は必須です'),
  note: z.string().nonempty('備考は必須です').optional()
})

/**
 * アクセス情報の型定義
 */
export const AccessInfoSchema = z.object({
  station: z.string().nonempty('駅名は必須です'),
  description: z.string().nonempty('アクセス説明は必須です').optional(),
  duration: z.string().nonempty('所要時間は必須です').optional(),
  notes: z.string().nonempty('備考は必須です').optional(),
  lines: z.array(z.string().nonempty('路線名は必須です'))
})

/**
 * 座標の型定義
 */
export const CoordinatesSchema = z.object({
  latitude: z.number(),
  longitude: z.number()
})

/**
 * 店舗詳細情報の型定義
 */
export const StoreDetailsSchema = z.object({
  store_id: z.number().int().positive().optional(),
  name: z.string().nonempty('店舗名は必須です').optional(),
  address: z.string().nonempty('住所は必須です').optional(),
  phone: z.string().nonempty('電話番号は必須です').optional(),
  birthday: z.string().nonempty('誕生日は必須です').optional(),
  open_all_year: z.boolean().optional(),
  hours: z.array(HoursSchema).optional(),
  access: z.array(AccessInfoSchema)
})

/**
 * キャラクター情報の型定義
 */
export const CharacterSchema = z
  .object({
    name: z.string().nonempty('キャラクター名は必須です'),
    aliases: z.array(z.string().nonempty('別名は必須です')).nonempty('別名を最低 1 つ指定してください').optional(),
    description: z.string().nonempty('説明は必須です'),
    twitter_id: z.string().nonempty().optional(),
    images: z.array(z.string().nonempty('画像URLは必須です')).nonempty('画像を最低 1 つ指定してください'),
    birthday: z.string().nonempty('誕生日は必須です').optional(),
    is_biccame_musume: z.boolean().optional(),
    /** stampcamera.com のキャラクターパッケージID。OG 画像生成時に透過版 SD 画像を取得するのに使う */
    stampcamera_package_id: z.number().int().positive().optional()
  })
  .transform((v) => ({
    ...v,
    image_url: (() => {
      const key: string = v.images.findLast((url) => url.endsWith('4.png')) || v.images[v.images.length - 1]
      return new URL(key, 'https://biccame.jp/profile/').href
    })()
  }))

/**
 * キャラクターと店舗情報を含むデータの型定義
 */
export const StoreDataSchema = z
  .object({
    id: z.string().nonempty('店舗IDは必須です'),
    character: CharacterSchema,
    prefecture: z.string().nonempty('都道府県は必須です').nullable(),
    coordinates: CoordinatesSchema.optional().nullable(),
    postal_code: z.string().nonempty('郵便番号は必須です').optional().nullable(),
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
export const StoresSchema = z.array(StoreDataSchema).nonempty('店舗データを最低 1 つ指定してください')
