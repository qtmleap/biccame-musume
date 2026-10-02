import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'

const CharactersJsonSchema = z.array(
  z.object({
    id: z.string().nonempty(),
    character: z.object({ is_biccame_musume: z.boolean().default(false) }).optional()
  })
)

type CharactersJson = z.infer<typeof CharactersJsonSchema>

const cachedSets = new WeakMap<Fetcher, Set<string>>()

/**
 * /characters.json (public) を ASSETS バインディング経由で取得し、
 * is_biccame_musume === true のキャラクター ID だけを Set に詰めて返す。
 * ASSETS ごとに成功結果だけをキャッシュし、呼出し元にはコピーを返す。
 */
export const loadBiccameMusumeIdSet = async (assets: Fetcher, baseUrl: string): Promise<Set<string>> => {
  const cachedSet = cachedSets.get(assets)
  if (cachedSet !== undefined) return new Set(cachedSet)
  try {
    const url = new URL('/characters.json', baseUrl)
    const res = await assets.fetch(new Request(url.toString()))
    if (!res.ok) throw new Error('Character assets unavailable')
    const parsed = CharactersJsonSchema.safeParse(await res.json())
    if (!parsed.success) throw new Error('Invalid character assets')
    const data: CharactersJson = parsed.data
    const ids = new Set(data.filter((c) => c.character?.is_biccame_musume === true).map((c) => c.id))
    cachedSets.set(assets, ids)
    return new Set(ids)
  } catch (cause) {
    throw new HTTPException(503, {
      message: 'キャラクター情報を取得できませんでした。時間をおいて再度お試しください。',
      cause
    })
  }
}
