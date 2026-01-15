import { TwitterApi } from 'twitter-api-v2'
import { EVENT_CATEGORY_LABELS, STORE_NAME_LABELS } from '@/locales/app.content'
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
  const category = EVENT_CATEGORY_LABELS[event.category]

  // メイン店舗名（最初の店舗）
  const mainStore = event.stores[0]
  const mainStoreName = STORE_NAME_LABELS[mainStore]

  // 複数店舗の場合の表記
  const storeCount = event.stores.length
  const storeText = storeCount === 1 ? `${mainStoreName}` : `${mainStoreName}など${storeCount}店舗`

  const lines = [
    `${storeText}の${category}イベントを${action}しました！`,
    '',
    `https://biccame-musume.com/events/${event.id}`,
    '',
    '#ビッカメ娘',
    '#ビックカメラ',
    `#${mainStoreName}`
  ]

  return lines.join('\n')
}

/**
 * イベント作成時にツイートを投稿
 */
export const tweetEventCreated = async (env: Bindings, event: Event): Promise<void> => {
  const text = generateTweetText(event, false)

  // 環境変数が設定されていない場合はスキップ
  if (!env.TWITTER_API_KEY || !env.TWITTER_API_SECRET || !env.TWITTER_ACCESS_TOKEN || !env.TWITTER_ACCESS_SECRET) {
    console.warn('Twitter API credentials not configured. Skipping tweet.')
    return
  }

  const client = new TwitterApi({
    appKey: env.TWITTER_API_KEY,
    appSecret: env.TWITTER_API_SECRET,
    accessToken: env.TWITTER_ACCESS_TOKEN,
    accessSecret: env.TWITTER_ACCESS_SECRET
  })

  try {
    // 告知ツイートがあれば引用RT、なければ通常のツイート
    const announceTweet = event.referenceUrls?.find((ref) => ref.type === 'announce')
    const quoteTweetId = announceTweet ? extractTweetId(announceTweet.url) : null

    if (quoteTweetId) {
      const result = await client.v2.tweet(text, { quote_tweet_id: quoteTweetId })
      console.log('Quote tweet posted successfully:', result)
    } else {
      const result = await client.v2.tweet(text)
      console.log('Tweet posted successfully:', result)
    }
  } catch (error) {
    console.error('Failed to post tweet:', error)
    throw error
  }
}

/**
 * イベント更新時にツイートを投稿
 */
export const tweetEventUpdated = async (env: Bindings, event: Event): Promise<void> => {
  const text = generateTweetText(event, true)

  // 環境変数が設定されていない場合はスキップ
  if (!env.TWITTER_API_KEY || !env.TWITTER_API_SECRET || !env.TWITTER_ACCESS_TOKEN || !env.TWITTER_ACCESS_SECRET) {
    console.warn('Twitter API credentials not configured. Skipping tweet.')
    return
  }

  const client = new TwitterApi({
    appKey: env.TWITTER_API_KEY,
    appSecret: env.TWITTER_API_SECRET,
    accessToken: env.TWITTER_ACCESS_TOKEN,
    accessSecret: env.TWITTER_ACCESS_SECRET
  })

  try {
    // 告知ツイートがあれば引用RT、なければ通常のツイート
    const announceTweet = event.referenceUrls?.find((ref) => ref.type === 'announce')
    const quoteTweetId = announceTweet ? extractTweetId(announceTweet.url) : null

    if (quoteTweetId) {
      const result = await client.v2.tweet(text, { quote_tweet_id: quoteTweetId })
      console.log('Quote tweet posted successfully:', result)
    } else {
      const result = await client.v2.tweet(text)
      console.log('Tweet posted successfully:', result)
    }
  } catch (error) {
    console.error('Failed to post tweet:', error)
    throw error
  }
}
