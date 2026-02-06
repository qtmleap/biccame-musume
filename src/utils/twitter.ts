import { TwitterApi } from 'twitter-api-v2'
import { CHARACTER_NAME_LABELS, STORE_NAME_LABELS } from '@/locales/app.content'
import type { Event } from '@/schemas/event.dto'
import type { Bindings } from '@/types/bindings'

/**
 * Twitter URLからツイートIDを抽出
 */
const extractTweetId = (url: string): string | null => {
  const match = url.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/)
  return match ? match[1] : null
}

/**
 * イベント情報からツイート本文を生成
 */
const generateTweetText = (event: Event, isUpdate: boolean): string => {
  const action = isUpdate ? '更新' : '追加'

  // メイン店舗（最初の店舗）
  const store = event.stores[0]
  const storeName = STORE_NAME_LABELS[store]
  const characterName = CHARACTER_NAME_LABELS[store] || storeName

  // 複数店舗の場合の表記
  const length = event.stores.length
  const storeText = length === 1 ? characterName : `${characterName}など${length}店舗`

  const lines = [
    `${storeText}の「${event.title}」を${action}しました！`,
    '',
    `https://biccame-musume.com/events/${event.uuid}`,
    '',
    '#ビッカメ娘',
    '#ビックカメラ',
    `#${storeName}`,
    `#${characterName}`
  ]

  return lines.join('\n')
}

/**
 * Twitter APIクライアントを作成 (OAuth 1.0a)
 */
const createTwitterClient = (env: Bindings): TwitterApi => {
  return new TwitterApi({
    appKey: env.TWITTER_API_KEY,
    appSecret: env.TWITTER_API_SECRET,
    accessToken: env.TWITTER_ACCESS_TOKEN,
    accessSecret: env.TWITTER_ACCESS_SECRET
  })
}

/**
 * Twitter認証情報が設定されているか確認
 */
const hasTwitterCredentials = (env: Bindings): boolean => {
  return !!(env.TWITTER_API_KEY && env.TWITTER_API_SECRET && env.TWITTER_ACCESS_TOKEN && env.TWITTER_ACCESS_SECRET)
}

/**
 * ローカル環境かどうか判定
 */
const isLocalEnvironment = (env: Bindings): boolean => {
  return !env.ENVIRONMENT || env.ENVIRONMENT === 'local'
}

/**
 * イベントから引用RT用のツイートIDを抽出
 */
const getQuoteTweetId = (event: Event): string | undefined => {
  const urls: string[] = event.referenceUrls?.map((ref) => ref.url) || []
  const url: string | undefined = urls.at(-1)
  if (url === undefined) {
    return undefined
  }
  return extractTweetId(url) ?? undefined
}

/**
 * ツイートを投稿する共通処理
 */
const postTweet = async (env: Bindings, event: Event, isUpdate: boolean): Promise<void> => {
  if (!hasTwitterCredentials(env)) {
    console.warn('[Twitter] API credentials not configured. Skipping tweet.')
    return
  }

  const text = generateTweetText(event, isUpdate)
  const quoteTweetId = getQuoteTweetId(event)

  // ローカル環境ではリクエスト内容をログ出力してスキップ
  if (isLocalEnvironment(env)) {
    console.log('[Twitter] Skipping tweet in local environment. Would have sent:', {
      text,
      quoteTweetId
    })
    return
  }

  const client = createTwitterClient(env)

  try {
    console.log('[Twitter API] Request:', { text, quoteTweetId })

    const result = quoteTweetId ? await client.v2.quote(text, quoteTweetId) : await client.v2.tweet(text)

    console.log('[Twitter] Tweet posted successfully:', result.data)
  } catch (error) {
    console.error('[Twitter] Failed to post tweet:', error)
    throw error
  }
}

/**
 * イベント作成時にツイートを投稿
 */
export const tweetEventCreated = async (env: Bindings, event: Event): Promise<void> => {
  await postTweet(env, event, false)
}

/**
 * イベント更新時にツイートを投稿
 */
export const tweetEventUpdated = async (env: Bindings, event: Event): Promise<void> => {
  await postTweet(env, event, true)
}
