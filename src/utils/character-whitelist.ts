type CharactersJson = Array<{
  id: string
  character?: { is_biccame_musume?: boolean }
}>

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
  const data = (await res.json()) as CharactersJson
  cachedSet = new Set(data.filter((c) => c.character?.is_biccame_musume === true).map((c) => c.id))
  return cachedSet
}
