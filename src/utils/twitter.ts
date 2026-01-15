import Base64 from 'crypto-js/enc-base64'
import HmacSHA1 from 'crypto-js/hmac-sha1'
import OAuth from 'oauth-1.0a'
import { z } from 'zod'
import { EVENT_CATEGORY_LABELS, STORE_NAME_LABELS } from '@/locales/app.content'
import type { Event } from '@/schemas/event.dto'
import type { Bindings } from '@/types/bindings'

/**
 * Twitter API v2 ツイート投稿レスポンススキーマ
 */
const TwitterResponseSchema = z.object({
  data: z.object({
    id: z.string(),
    text: z.string()
  })
})

type TwitterResponse = z.infer<typeof TwitterResponseSchema>

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
 * シンプルなTwitter APIクライアント
 */
class TwitterApi {
  private oauth: OAuth

  constructor(
    apiKey: string,
    apiSecret: string,
    private accessToken: string,
    private accessSecret: string
  ) {
    this.oauth = new OAuth({
      consumer: { key: apiKey, secret: apiSecret },
      signature_method: 'HMAC-SHA1',
      hash_function(baseString, key) {
        return Base64.stringify(HmacSHA1(baseString, key))
      }
    })
  }

  /**
   * ツイートを投稿
   */
  async tweet(text: string, quoteTweetId?: string): Promise<TwitterResponse> {
    const url = 'https://api.twitter.com/2/tweets'
    const body: { text: string; quote_tweet_id?: string } = { text }
    if (quoteTweetId) {
      body.quote_tweet_id = quoteTweetId
    }

    const requestData = {
      url,
      method: 'POST',
      data: {} // OAuth署名にはボディを含めない
    }

    const token = {
      key: this.accessToken,
      secret: this.accessSecret
    }

    const authData = this.oauth.authorize(requestData, token)
    const authHeader = this.oauth.toHeader(authData)

    console.log('[Twitter API] Request:', {
      url,
      body
    })

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('[Twitter API] Error response:', {
        status: response.status,
        body: error
      })
      throw new Error(`Twitter API error: ${response.status} ${error}`)
    }

    const result = TwitterResponseSchema.safeParse(await response.json())

    if (!result.success) {
      console.error('[Twitter API] Invalid response format:', result.error)
      throw new Error('Twitter API returned invalid response format')
    }

    console.log('Tweet posted successfully:', result.data)
    return result.data
  }
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

  const client = new TwitterApi(
    env.TWITTER_API_KEY,
    env.TWITTER_API_SECRET,
    env.TWITTER_ACCESS_TOKEN,
    env.TWITTER_ACCESS_SECRET
  )

  try {
    // 告知ツイートがあれば引用RT、なければ通常のツイート
    const announceTweet = event.referenceUrls?.find((ref) => ref.type === 'announce')
    const quoteTweetId = announceTweet ? extractTweetId(announceTweet.url) : null

    await client.tweet(text, quoteTweetId || undefined)
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

  const client = new TwitterApi(
    env.TWITTER_API_KEY,
    env.TWITTER_API_SECRET,
    env.TWITTER_ACCESS_TOKEN,
    env.TWITTER_ACCESS_SECRET
  )

  try {
    // 告知ツイートがあれば引用RT、なければ通常のツイート
    const announceTweet = event.referenceUrls?.find((ref) => ref.type === 'announce')
    const quoteTweetId = announceTweet ? extractTweetId(announceTweet.url) : null

    await client.tweet(text, quoteTweetId || undefined)
  } catch (error) {
    console.error('Failed to post tweet:', error)
    throw error
  }
}
