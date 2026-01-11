import { z } from 'zod'

/**
 * 営業時間の型定義
 */
export const HoursSchema = z.object({
  type: z.enum(['weekday', 'weekend', 'holiday', 'all']),
  openTime: z.string().nonempty(),
  closeTime: z.string().nonempty(),
  note: z.string().nonempty().optional()
})

export type Hours = z.infer<typeof HoursSchema>

/**
 * アクセス情報の型定義
 */
export const AccessInfoSchema = z.object({
  station: z.string().nonempty(),
  description: z.string(),
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
 * キャラクター情報の型定義
 */
export const CharacterSchema = z.object({
  name: z.string().nonempty(),
  aliases: z.array(z.string().nonempty()).nonempty().optional(),
  description: z.string().nonempty(),
  twitterId: z.string(),
  images: z.array(z.string().nonempty()).nonempty(),
  birthday: z.string().nonempty().optional(),
  isBiccameMusume: z.boolean().optional()
})

export type Character = z.infer<typeof CharacterSchema>

/**
 * 店舗情報の型定義
 */
export const StoreSchema = z.object({
  id: z.string().nonempty(),
  storeId: z.number().int().positive().optional(),
  name: z.string().nonempty().optional(),
  address: z.string().nonempty().optional(),
  postalCode: z.string().nonempty().optional(),
  phone: z.string().nonempty().optional(),
  birthday: z.string().nonempty().optional(),
  openAllYear: z.boolean().optional(),
  hours: z.array(HoursSchema).optional(),
  access: z.array(AccessInfoSchema).optional(),
  coordinates: CoordinatesSchema.optional(),
  character: CharacterSchema.optional()
})

export type Store = z.infer<typeof StoreSchema>

/**
 * 店舗リストの型定義
 */
export const StoresSchema = z.array(StoreSchema).nonempty()

export type Stores = z.infer<typeof StoresSchema>
