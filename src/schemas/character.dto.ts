import { z } from 'zod'

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
