import { getEvent } from '@/services/event-service'
import type { Bindings } from '@/types/bindings'

const SITE_BASE = 'https://biccame-musume.com'
const DEFAULT_TITLE = 'ビッカメ娘 -ビッカメ娘推し活応援プロジェクト-'
const DEFAULT_DESCRIPTION =
  'ビッカメ娘ファンサイト。ビッカメ娘はビックカメラの店舗擬人化プロジェクトとして活動しています。キャラクター情報、誕生日カレンダー、店舗マップなど。'
const DEFAULT_IMAGE = `${SITE_BASE}/og_image.webp`

export type OgMeta = {
  title: string
  description: string
  url: string
  image: string
  type: 'website' | 'article'
}

type StaticMeta = Pick<OgMeta, 'title' | 'description'> & { image?: string; type?: OgMeta['type'] }

const STATIC_ROUTES: Record<string, StaticMeta> = {
  '/': {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION
  },
  '/about': {
    title: 'ビッカメ娘について | ビッカメ娘推し活応援プロジェクト',
    description: 'ビッカメ娘推し活応援プロジェクトとは。ビッカメ娘の歴史、各キャラクターの紹介、活動について。'
  },
  '/calendar': {
    title: 'お誕生日カレンダー | ビッカメ娘推し活応援プロジェクト',
    description: 'ビッカメ娘 各キャラクターの誕生日カレンダー。今日が誕生日のキャラを毎日チェック。'
  },
  '/characters': {
    title: 'キャラクター一覧 | ビッカメ娘推し活応援プロジェクト',
    description: 'ビッカメ娘 全キャラクター一覧。店舗・地域・誕生日から推しを探せる。'
  },
  '/events': {
    title: 'イベント一覧 | ビッカメ娘推し活応援プロジェクト',
    description: 'ビッカメ娘の限定カード配布・イベント情報。開催中・開催予定のイベントを一覧でチェック。'
  },
  '/badges': {
    title: 'バッジ一覧 | ビッカメ娘推し活応援プロジェクト',
    description: 'ビッカメ娘 推し活で集められるバッジコレクション。'
  },
  '/ranking': {
    title: 'ランキング | ビッカメ娘推し活応援プロジェクト',
    description: 'ビッカメ娘 推されているキャラクターランキング。応援投票でみんなを盛り上げよう。'
  },
  '/location': {
    title: '店舗マップ | ビッカメ娘推し活応援プロジェクト',
    description: 'ビッカメ娘 全店舗の地図。お近くのビックカメラ店舗からキャラに会いに行こう。'
  },
  '/route': {
    title: '聖地巡礼ルート | ビッカメ娘推し活応援プロジェクト',
    description: 'ビッカメ娘 店舗巡りルート案内。効率的な聖地巡礼プランをチェック。'
  },
  '/contact': {
    title: 'お問い合わせ | ビッカメ娘推し活応援プロジェクト',
    description: 'ビッカメ娘推し活応援プロジェクトへのお問い合わせ。'
  }
}

const buildDefault = (path: string): OgMeta => ({
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
  url: `${SITE_BASE}${path}`,
  image: DEFAULT_IMAGE,
  type: 'website'
})

const normalizePath = (path: string): string => {
  const stripped = path.replace(/\/+$/, '')
  return stripped === '' ? '/' : stripped
}

const truncate = (s: string, n: number): string => (s.length <= n ? s : `${s.slice(0, n - 1)}…`)

type RawCharacter = {
  id: string
  character: { name: string; description: string; is_biccame_musume?: boolean }
  store?: { name?: string }
}

const fetchCharacter = async (env: Bindings, id: string, origin: string): Promise<RawCharacter | null> => {
  try {
    const res = await env.ASSETS.fetch(new Request(`${origin}/characters.json`))
    if (!res.ok) return null
    const list = (await res.json()) as RawCharacter[]
    return list.find((c) => c.id === id) ?? null
  } catch {
    return null
  }
}

const resolveCharacter = async (env: Bindings, id: string, origin: string, path: string): Promise<OgMeta> => {
  const character = await fetchCharacter(env, id, origin)
  if (!character) return buildDefault(path)
  const storeName = character.store?.name ?? 'ビックカメラ店舗'
  return {
    title: `${character.character.name} (${storeName}) | ビッカメ娘`,
    description: truncate(character.character.description, 140),
    url: `${SITE_BASE}${path}`,
    image: `${SITE_BASE}/og/characters/${id}.png`,
    type: 'article'
  }
}

const formatDateRange = (startDate: Date, endDate?: Date): string => {
  const fmt = (d: Date): string => {
    const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
    return `${jst.getUTCFullYear()}/${String(jst.getUTCMonth() + 1).padStart(2, '0')}/${String(jst.getUTCDate()).padStart(2, '0')}`
  }
  if (!endDate) return `${fmt(startDate)} 〜`
  return `${fmt(startDate)} 〜 ${fmt(endDate)}`
}

const resolveEvent = async (env: Bindings, id: string, path: string): Promise<OgMeta> => {
  try {
    const event = await getEvent(env, id)
    return {
      title: `${event.title} | ビッカメ娘イベント`,
      description: truncate(`${event.title} ${formatDateRange(event.startDate, event.endDate)}`, 140),
      url: `${SITE_BASE}${path}`,
      image: DEFAULT_IMAGE,
      type: 'article'
    }
  } catch {
    return buildDefault(path)
  }
}

/**
 * パスから OG メタデータを解決する。
 * 静的ルートはテーブル参照、/characters/:id と /events/:uuid は動的に解決。
 * 解決失敗時はサイトデフォルトを返すので、呼び出し側でフォールバック判定不要。
 */
export const resolveOgMeta = async (env: Bindings, requestUrl: string): Promise<OgMeta> => {
  const url = new URL(requestUrl)
  const path = normalizePath(url.pathname)
  const origin = url.origin

  const staticHit = STATIC_ROUTES[path]
  if (staticHit) {
    return {
      title: staticHit.title,
      description: staticHit.description,
      url: `${SITE_BASE}${path}`,
      image: staticHit.image ?? DEFAULT_IMAGE,
      type: staticHit.type ?? 'website'
    }
  }

  const characterMatch = path.match(/^\/characters\/([^/]+)$/)
  if (characterMatch) return resolveCharacter(env, characterMatch[1], origin, path)

  const eventMatch = path.match(/^\/events\/([^/]+)$/)
  if (eventMatch) return resolveEvent(env, eventMatch[1], path)

  return buildDefault(path)
}
