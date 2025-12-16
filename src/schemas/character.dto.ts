import { z } from 'zod'

/**
 * ビッカメ娘キャラクター情報のスキーマ定義
 */
export const CharacterSchema = z.object({
  character_name: z.string(),
  store_name: z.string(),
  detail_url: z.string().url(),
  key: z.string(),
  description: z.string(),
  twitter_url: z.string().url().optional(),
  zipcode: z.string().optional(),
  address: z.string().optional(),
  store_birthday: z.string().optional(),
  store_link: z.string().url().optional(),
  image_urls: z.array(z.string().url()).optional(),
  character_birthday: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional()
})

export type Character = z.infer<typeof CharacterSchema>

export const CharactersSchema = z.array(CharacterSchema)

export type Characters = z.infer<typeof CharactersSchema>
