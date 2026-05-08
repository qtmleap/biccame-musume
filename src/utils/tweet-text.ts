import { CHARACTER_NAME_LABELS, STORE_NAME_LABELS } from '@/locales/app.content'
import type { Event, EventDetail } from '@/schemas/event.dto'

const SITE_BASE = 'https://biccame-musume.com'
const TWITTER_URL_WEIGHT = 23
export const TWEET_WEIGHT_LIMIT = 280

/**
 * Twitter weighted character count.
 * - Latin / Cyrillic / common ASCII = 1
 * - Everything else (CJK / emoji etc.) = 2
 * - Each URL counts as a fixed 23 weight (t.co shortening)
 *
 * See https://developer.x.com/en/docs/counting-characters
 */
export const weightedLength = (text: string): number => {
  const urls = [...text.matchAll(/https?:\/\/\S+/g)]
  const stripped = urls.reduce((acc, m) => acc.replace(m[0], ''), text)
  const urlWeight = urls.length * TWITTER_URL_WEIGHT
  const charWeight = [...stripped].reduce((acc, ch) => {
    const cp = ch.codePointAt(0) ?? 0
    const isLightWeight =
      (cp >= 0x0000 && cp <= 0x10ff) ||
      (cp >= 0x2000 && cp <= 0x200d) ||
      (cp >= 0x2010 && cp <= 0x201f) ||
      (cp >= 0x2032 && cp <= 0x2037)
    return acc + (isLightWeight ? 1 : 2)
  }, 0)
  return urlWeight + charWeight
}

const eventStoreLabel = (event: Pick<Event, 'stores'>): { storeName: string; characterName: string } => {
  const store = event.stores[0]
  return {
    storeName: STORE_NAME_LABELS[store],
    characterName: CHARACTER_NAME_LABELS[store] || STORE_NAME_LABELS[store]
  }
}

const eventStoreText = ({ stores }: Pick<Event, 'stores'>): string => {
  const { characterName } = eventStoreLabel({ stores })
  return stores.length === 1 ? characterName : `${characterName}など${stores.length}店舗`
}

export const buildEventCreatedText = (event: EventDetail): string => {
  const { storeName, characterName } = eventStoreLabel(event)
  return [
    `${eventStoreText(event)}の「${event.title}」を追加しました！`,
    '',
    `${SITE_BASE}/events/${event.uuid}`,
    '',
    '#ビッカメ娘',
    '#ビックカメラ',
    `#${storeName}`,
    `#${characterName}`
  ].join('\n')
}

export const buildEventUpdatedText = (event: EventDetail): string => {
  const { storeName, characterName } = eventStoreLabel(event)
  return [
    `${eventStoreText(event)}の「${event.title}」を更新しました！`,
    '',
    `${SITE_BASE}/events/${event.uuid}`,
    '',
    '#ビッカメ娘',
    '#ビックカメラ',
    `#${storeName}`,
    `#${characterName}`
  ].join('\n')
}

const dailyHeader = (count: number): string => `本日は${count}件のイベントが開催予定です！`
const dailyHashtags = ['#ビッカメ娘', '#ビックカメラ']

const formatEventLine = (event: Pick<Event, 'stores' | 'title'>): string => {
  const { characterName } = eventStoreLabel(event)
  return `- ${characterName}の${event.title}`
}

type DailySummaryEvent = Pick<Event, 'stores' | 'title'>

const MAX_EVENTS_PER_TWEET = 3

const chunk = <T>(arr: T[], size: number): T[][] =>
  arr.length === 0 ? [] : [arr.slice(0, size), ...chunk(arr.slice(size), size)]

/**
 * Build the daily-summary tweet thread.
 * - 1 つのツイートに最大 3 イベント
 * - 1 ツイート目だけ "本日は{N}件…" のヘッダを付ける
 * - 各ツイートに #ビッカメ娘 / #ビックカメラ ハッシュタグを付ける
 * - 連投時は呼び出し側で順次リプライチェーンに繋ぐ前提
 */
export const buildDailySummaryTweets = (events: DailySummaryEvent[]): string[] => {
  if (events.length === 0) throw new Error('buildDailySummaryTweets called with 0 events')
  const groups = chunk(events, MAX_EVENTS_PER_TWEET)
  const tweets = groups.map((group, i) => {
    const lines = group.map(formatEventLine)
    const header = i === 0 ? [dailyHeader(events.length), ''] : []
    return [...header, ...lines, '', ...dailyHashtags].join('\n')
  })
  for (const t of tweets) {
    if (weightedLength(t) > TWEET_WEIGHT_LIMIT) {
      throw new Error(`Daily summary tweet exceeds ${TWEET_WEIGHT_LIMIT} weighted chars: ${weightedLength(t)}`)
    }
  }
  return tweets
}

const TWITTER_URL_RE = /(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/

const extractTweetId = (url: string): string | null => {
  const m = url.match(TWITTER_URL_RE)
  return m ? m[1] : null
}

type ReferenceUrl = { type: 'announce' | 'start' | 'end'; url: string }

/**
 * Pick the X (Twitter) status URL to quote-RT, depending on whether this is a
 * create or update event tweet.
 *   - create: announce が X URL ならそれ
 *   - update: end が X URL ならそれ、無ければ announce
 */
export const getQuoteTweetId = (refs: ReferenceUrl[], mode: 'create' | 'update'): string | undefined => {
  const findOf = (type: ReferenceUrl['type']): string | undefined => {
    const match = refs.find((r) => r.type === type)
    if (!match) return undefined
    return extractTweetId(match.url) ?? undefined
  }
  if (mode === 'update') return findOf('end') ?? findOf('announce')
  return findOf('announce')
}
