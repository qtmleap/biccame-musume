import { CHARACTER_NAME_LABELS, STORE_NAME_LABELS } from '@/locales/app.content'
import type { Event, EventDetail } from '@/schemas/event.dto'

const SITE_BASE = 'https://biccame-musume.com'
const TWITTER_URL_WEIGHT = 23
const TWEET_WEIGHT_LIMIT = 280

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

const dailyHeader = (count: number): string => `本日開始のイベント (${count}件)`
const dailyHashtags = '#ビッカメ娘 #ビックカメラ'
const dailySiteUrl = `${SITE_BASE}/events`

const formatEventLine = (event: Pick<Event, 'stores' | 'title' | 'uuid'>): string => {
  const { characterName } = eventStoreLabel(event)
  return `・${characterName}「${event.title}」\n  ${SITE_BASE}/events/${event.uuid}`
}

/**
 * Build the daily-summary tweet body.
 * If the body would exceed 280 weighted chars, fall back to:
 *   "本日開始のイベント (N件)\n<first M events>\n他 K 件\nhttps://biccame-musume.com/events\n#..."
 * progressively dropping events until it fits.
 */
type DailySummaryEvent = Pick<Event, 'stores' | 'title' | 'uuid'>

export const buildDailySummaryText = (events: DailySummaryEvent[]): string => {
  if (events.length === 0) throw new Error('buildDailySummaryText called with 0 events')

  const buildBody = (count: number): string => {
    const head = dailyHeader(events.length)
    const visible = events.slice(0, count).map(formatEventLine)
    const omitted = events.length - count
    const omitNotice = omitted > 0 ? [`他 ${omitted} 件`, dailySiteUrl] : []
    return [head, '', ...visible, ...(omitNotice.length ? ['', ...omitNotice] : []), '', dailyHashtags].join('\n')
  }

  const findFit = (count: number): string => {
    if (count <= 0) {
      const head = dailyHeader(events.length)
      return [head, '', dailySiteUrl, '', dailyHashtags].join('\n')
    }
    const body = buildBody(count)
    if (weightedLength(body) <= TWEET_WEIGHT_LIMIT) return body
    return findFit(count - 1)
  }

  return findFit(events.length)
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
