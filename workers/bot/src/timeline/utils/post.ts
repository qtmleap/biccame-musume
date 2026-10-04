import type { Dayjs } from 'dayjs'
import { uniqBy } from 'lodash-es'
import { v5 as uuidv5 } from 'uuid'
import { z } from 'zod'
import { Client } from '../client'
import { characters } from '../data/characters'
import type { Post, TweetResultsResult } from '../schemas/response.dto'
import type { DiscordWebhookPayload } from '../types/discord.dto'
import { parseTweet, type TweetExtraction } from './ai'
import type { Bindings } from './bindings'
import { dayjs } from './dayjs'
import { TimelineFailure } from './failure'

// tweet.idからUUIDを生成するための名前空間
const UUID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

const TweetInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  screenName: z.string(),
  createdAt: z.string(),
  text: z.string(),
  url: z.string()
})

export type TweetInfo = z.infer<typeof TweetInfoSchema>

/**
 * Postレスポンス1ページ分から実際のツイート情報を抽出（IDで重複を排除）
 *
 * キーワードと時刻での絞り込みはしない。ページ送りの停止判定に投稿時刻が要るため、
 * 絞り込む前の状態をここで返す。
 */
export const extract = (post: Post): TweetInfo[] => {
  const allTweets = post.data.search_by_raw_query.search_timeline.timeline.instructions
    .flatMap((instruction) => instruction.entries ?? [])
    .map((entry) => entry.content.itemContent)
    .filter((item): item is NonNullable<typeof item> => item != null)
    .map((item) => item.tweet_results.result)
    .filter((result): result is TweetResultsResult => result != null && 'legacy' in result)
    .map((result) => ({
      id: result.legacy.id_str,
      name: result.core.user_results.result.core.name,
      screenName: result.core.user_results.result.core.screen_name,
      createdAt: result.legacy.created_at,
      text: result.legacy.full_text,
      url: `https://x.com/${result.core.user_results.result.core.screen_name}/status/${result.legacy.id_str}`
    }))

  return uniqBy(allTweets, 'id')
}

/**
 * 配布イベントらしいツイートだけを残す。
 *
 * X検索の精度が低いため、キーワードでの絞り込みはAPI側ではなくここで行う。
 */
const KEYWORDS = ['配布', '名刺', 'アクキー', '終了', '開始', 'イベント']

const filterByKeyword = (tweets: TweetInfo[]): TweetInfo[] =>
  tweets.filter((tweet) => KEYWORDS.some((keyword) => tweet.text.includes(keyword)))

/**
 * 次ページのカーソル。これ以上辿れないときはundefined。
 */
const bottomCursor = (post: Post): string | undefined =>
  post.data.search_by_raw_query.search_timeline.timeline.instructions
    .flatMap((instruction) => instruction.entries ?? [])
    .map((entry) => entry.content)
    .find((content) => content.cursorType === 'Bottom')?.value

/**
 * createdAtが[since, until)に入るツイートだけを残す。
 *
 * X検索のsince/untilは日付単位までしか絞れないため、5分間隔で実行しても毎回その日
 * 1日ぶんの同じツイートが返ってくる。時刻での絞り込みはキーワードと同じくここで行う。
 * これが無いと同じツイートを日付が変わるまで5分ごとに通知し続ける。
 */
export const withinPeriod = (tweets: TweetInfo[], since: Dayjs, until: Dayjs): TweetInfo[] => {
  const from = since.valueOf()
  const to = until.valueOf()
  return tweets.filter((tweet) => {
    const createdAt = dayjs(tweet.createdAt).valueOf()
    return createdAt >= from && createdAt < to
  })
}

/**
 * Discord Bot APIへ1イベントを送信する。
 */
export const buildCandidatePayload = (
  tweet: TweetInfo,
  extraction: TweetExtraction,
  storeId: string,
  eventIndex: number
): DiscordWebhookPayload => {
  const { eventType, title, startDate, endDate, endAt, category } = extraction
  const uuidName = eventIndex === 0 ? tweet.id : `${tweet.id}:${eventIndex}`
  const uuid = uuidv5(uuidName, UUID_NAMESPACE)
  const url = new URL(`admin/events/${uuid}`, 'https://biccame-musume.com')
  if (category) url.searchParams.append('category', category)
  if (title) url.searchParams.append('title', title)
  url.searchParams.append('stores', storeId)
  url.searchParams.append('referenceUrls', tweet.url)
  if (startDate) url.searchParams.append('startDate', startDate)
  if (endDate) url.searchParams.append('endDate', endDate)
  if (endAt) url.searchParams.append('endAt', endAt)

  // 開始は青、終了は赤
  const color = eventType === 'start' ? 0x3498db : 0xe74c3c

  const payload: DiscordWebhookPayload = {
    content: tweet.url,
    embeds: [
      {
        title: title || undefined,
        color,
        timestamp: dayjs(tweet.createdAt).toISOString(),
        fields: [
          { name: '店舗', value: tweet.name, inline: false },
          { name: 'カテゴリ', value: category ?? '未定', inline: true },
          {
            name: '開始日',
            value: startDate ?? '未定',
            inline: true
          },
          {
            name: '終了日',
            value: endDate ?? '未定',
            inline: true
          },
          {
            name: '完了日',
            value: endAt ?? '未定',
            inline: true
          }
        ]
      }
    ],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 5,
            label: 'ツイートを見る',
            url: tweet.url
          },
          {
            type: 2,
            style: 5,
            label: '作成',
            url: url.href
          }
        ]
      }
    ]
  }

  return payload
}

export const sendCandidate = async (env: Bindings, payload: DiscordWebhookPayload): Promise<void> => {
  if (!env.DISCORD_TOKEN?.trim() || !/^\d+$/.test(env.DISCORD_CHANNEL_ID)) throw new TimelineFailure('configuration')
  let response: Response
  try {
    response = await fetch(`https://discord.com/api/v10/channels/${env.DISCORD_CHANNEL_ID}/messages`, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bot ${env.DISCORD_TOKEN}` },
      body: JSON.stringify(payload)
    })
  } catch {
    // 受理後の応答喪失も含むため、無条件に再送しない。
    throw new TimelineFailure('delivery_unknown')
  }
  await response.body?.cancel()
  if (response.status === 429) throw new TimelineFailure('rate_limited', 429)
  if (!response.ok) throw new TimelineFailure('discord_rejected', response.status)
}

/**
 * Discord Bot APIでツイート内の配布イベントを送信（ボタン付き）
 */
type NotificationOptions = {
  dryRun?: boolean
  analyze?: typeof parseTweet
  send?: typeof sendCandidate
}

export const post = async (
  env: Bindings,
  tweet: TweetInfo,
  options: NotificationOptions = {}
): Promise<DiscordWebhookPayload[]> => {
  const analyze = options.analyze ? options.analyze : parseTweet
  const extractions = await analyze(env, tweet)
  const distributionEvents = extractions.filter((extraction) => extraction.isDistributionEvent)
  if (distributionEvents.length === 0) return []
  const storeId = characters.find((character) => character.twitter_id === tweet.screenName)?.id
  if (!storeId) return []
  const payloads = distributionEvents.map((extraction, index) =>
    buildCandidatePayload(tweet, extraction, storeId, index)
  )
  if (!options.dryRun) {
    const send = options.send ? options.send : sendCandidate
    for (const payload of payloads) await send(env, payload)
  }
  return payloads
}

// 1リクエストはX側の上限で20件。5分間の投稿がそれを超える場合に備えてページを辿るが、
// 際限なく辿るとWorkersのCPU時間とX側のレートリミットに当たるため上限を設ける。
const MAX_PAGES = 5

/**
 * 窓を覆うまでページを辿ってツイートを集める。
 *
 * 検索はLatest順なので、あるページにsinceより古いツイートが現れた時点でその窓の投稿は
 * すべて見えている。現れないうちは窓が1ページに収まっていないため次のページへ進む。
 */
export const collectWindow = async (
  client: Pick<Client, 'search'>,
  since: Dayjs,
  until: Dayjs
): Promise<{ tweets: TweetInfo[]; pages: number; exhausted: boolean }> => {
  const collected: TweetInfo[] = []
  let cursor: string | undefined
  let pages = 0

  while (pages < MAX_PAGES) {
    const page = await client.search({ since, until, cursor })
    const tweets = extract(page)
    pages += 1
    collected.push(...tweets)

    const oldest = tweets.length === 0 ? undefined : Math.min(...tweets.map((t) => dayjs(t.createdAt).valueOf()))
    const covered = oldest === undefined || oldest < since.valueOf()
    const next = bottomCursor(page)

    // カーソルが進まない場合も打ち切る（同じページを取り続けないため）
    if (covered || !next || next === cursor) {
      return { tweets: uniqBy(collected, 'id'), pages, exhausted: false }
    }
    cursor = next
  }

  return { tweets: uniqBy(collected, 'id'), pages, exhausted: true }
}

/**
 * ツイートを取得してDiscordに通知する
 */
export const notify = async (
  env: Bindings,
  since: Dayjs,
  until: Dayjs,
  options: NotificationOptions & { client?: Pick<Client, 'search'> } = {}
): Promise<DiscordWebhookPayload[]> => {
  const client = options.client ? options.client : new Client(env)
  const { tweets: fetched, pages, exhausted } = await collectWindow(client, since, until)
  const inWindow = withinPeriod(fetched, since, until)
  const tweets = filterByKeyword(inWindow)

  console.log(
    'Fetched',
    JSON.stringify({
      startTime: since.format('YYYY-MM-DDTHH:mm:ssZ'),
      endTime: until.format('YYYY-MM-DDTHH:mm:ssZ'),
      pages,
      fetched: fetched.length,
      window: inWindow.length,
      count: tweets.length
    })
  )

  // 上限まで辿っても窓の先頭へ届かなかった場合、この窓のツイートを取りこぼしている
  if (exhausted) {
    console.warn(`Reached the ${MAX_PAGES}-page limit before covering the window; some tweets may be missing`)
  }

  // 順次Discordに投稿（並列だとレートリミットに引っかかりやすい）
  const payloads: DiscordWebhookPayload[] = []
  for (const tweet of tweets) payloads.push(...(await post(env, tweet, options)))
  return payloads
}
