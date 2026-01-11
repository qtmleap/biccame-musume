import { z } from 'zod'

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
 * 店舗詳細情報の型定義
 */
export const StoreDetailsSchema = z.object({
  store_id: z.number().int().positive().optional(),
  name: z.string().nonempty().optional(),
  address: z.string().nonempty().optional(),
  prefecture: z.string().nonempty().optional().nullable(),
  postal_code: z.string().nonempty().optional(),
  phone: z.string().nonempty().optional(),
  birthday: z.string().nonempty().optional(),
  open_all_year: z.boolean().optional(),
  hours: z.array(HoursSchema).optional(),
  access: z.array(AccessInfoSchema).optional(),
  coordinates: CoordinatesSchema.optional()
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
 * 店舗情報の型定義
 */
export const StoreSchema = z.object({
  id: z.string().nonempty(),
  character: CharacterSchema,
  store: StoreDetailsSchema.optional()
})

export type StoreData = z.infer<typeof StoreSchema>

/**
 * 店舗リストの型定義
 */
export const StoresSchema = z.array(StoreSchema).nonempty()

export type StoresData = z.infer<typeof StoresSchema>
