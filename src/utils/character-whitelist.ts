import { z } from 'zod'

const CharactersJsonSchema = z.array(
  z.object({
    id: z.string().nonempty(),
    character: z.object({ is_biccame_musume: z.boolean().default(false) }).optional()
  })
)

type CharactersJson = z.infer<typeof CharactersJsonSchema>

let cachedSet: Set<string> | null = null

/**
 * /characters.json (public) を ASSETS バインディング経由で取得し、
 * is_biccame_musume === true のキャラクター ID だけを Set に詰めて返す。
 * Worker のグローバルでキャッシュされ、初回以降は同期 Set lookup。
 */
export const loadBiccameMusumeIdSet = async (assets: Fetcher, baseUrl: string): Promise<Set<string>> => {
  if (cachedSet !== null) return cachedSet
  const url = new URL('/characters.json', baseUrl)
  const res = await assets.fetch(new Request(url.toString()))
  if (!res.ok) {
    return new Set()
  }
  const parsed = CharactersJsonSchema.safeParse(await res.json())
  if (!parsed.success) {
    return new Set()
  }
  const data: CharactersJson = parsed.data
  cachedSet = new Set(data.filter((c) => c.character?.is_biccame_musume === true).map((c) => c.id))
  return cachedSet
}
