/**
 * OG 画像のキャラクターの丸 Avatar。
 *
 * ビルド時に作る直径 320px の丸 PNG（/og/avatars/{storeKey}.png）を ASSETS から読み、data URL にして isolate 内で使い回す。
 * 素材が無い・壊れている・読み込みに失敗したときは例外にせず null を返し、描画側が「ビ」の丸印にフォールバックする。
 * 特殊値（secret / other）は画像を持たないので読まない（描画側が SpecialAvatar で描く）。
 */

import { isSpecialCharacter } from '@biccame/shared/domain/event-character'
import type { EventCharacter } from '@biccame/shared/schemas/event.dto'
import type { StoreKey } from '@biccame/shared/schemas/store.dto'

/** Avatar の読み込みに必要なのは ASSETS の fetch だけ（Bindings 全体は要らない）。 */
export type AvatarAssetsEnv = { ASSETS: Pick<Fetcher, 'fetch'> }

/** 読めた Avatar の data URL。素材が無い娘は含まれない。 */
export type AvatarImages = ReadonlyMap<StoreKey, string>

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const BASE64_CHUNK = 0x8000

const toDataUrl = (bytes: Uint8Array): string => {
  // 大きな配列を String.fromCharCode にまとめて渡すと引数の上限を超えるため、分けて文字列にする。
  const chunks = Array.from({ length: Math.ceil(bytes.length / BASE64_CHUNK) }, (_, index) =>
    String.fromCharCode(...bytes.subarray(index * BASE64_CHUNK, (index + 1) * BASE64_CHUNK))
  )
  return `data:image/png;base64,${btoa(chunks.join(''))}`
}

const fetchAvatar = async (env: AvatarAssetsEnv, origin: string, key: StoreKey): Promise<string | null> => {
  try {
    const response = await env.ASSETS.fetch(new Request(`${origin}/og/avatars/${key}.png`))
    // 存在しないパスは SPA のフォールバックで 200 の HTML が返るため、content-type と PNG の署名で素材かどうかを確かめる。
    const contentType = response.headers.get('content-type')
    if (!response.ok || contentType === null || !contentType.startsWith('image/png')) return null
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) return null
    return toDataUrl(bytes)
  } catch {
    console.warn(`[og-avatars] failed to load avatar: ${key}`)
    return null
  }
}

// 成功した結果だけを isolate 内に残す。失敗（null）は残さず、次の描画でもう一度読む。
const loaded = new Map<StoreKey, Promise<string | null>>()

const avatarDataUrl = (env: AvatarAssetsEnv, origin: string, key: StoreKey): Promise<string | null> => {
  const hit = loaded.get(key)
  if (hit !== undefined) return hit
  const created = fetchAvatar(env, origin, key).then((url) => {
    if (url === null) loaded.delete(key)
    return url
  })
  loaded.set(key, created)
  return created
}

/** 指定した娘の Avatar をまとめて読む。特殊値と、素材が読めなかった娘は結果に含まれない。 */
export const loadAvatars = async (
  env: AvatarAssetsEnv,
  origin: string,
  characters: readonly EventCharacter[]
): Promise<AvatarImages> => {
  const keys = [...new Set(characters)].filter((character): character is StoreKey => !isSpecialCharacter(character))
  const entries = await Promise.all(keys.map(async (key) => [key, await avatarDataUrl(env, origin, key)] as const))
  return new Map(entries.flatMap(([key, url]) => (url === null ? [] : [[key, url] as const])))
}
