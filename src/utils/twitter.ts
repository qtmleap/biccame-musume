import Base64 from 'crypto-js/enc-base64'
import HmacSHA1 from 'crypto-js/hmac-sha1'
import OAuth from 'oauth-1.0a'
import { z } from 'zod'
import { CHARACTER_NAME_LABELS, STORE_NAME_LABELS } from '@/locales/app.content'
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

  // メイン店舗（最初の店舗）
  const mainStore = event.stores[0]
  const mainStoreName = STORE_NAME_LABELS[mainStore]
  const characterName = CHARACTER_NAME_LABELS[mainStore] || mainStoreName

  // 複数店舗の場合の表記
  const storeCount = event.stores.length
  const storeText = storeCount === 1 ? characterName : `${characterName}など${storeCount}店舗`

  const lines = [
    `${storeText}の「${event.name}」を${action}しました！`,
    '',
    `https://biccame-musume.com/events/${event.uuid}`,
    '',
    '#ビッカメ娘',
    '#ビックカメラ',
    `#${mainStoreName}`,
    `#${characterName}`
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

  const client = new TwitterApi(
    env.TWITTER_API_KEY,
    env.TWITTER_API_SECRET,
    env.TWITTER_ACCESS_TOKEN,
    env.TWITTER_ACCESS_SECRET
  )

  try {
    await client.tweet(text, quoteTweetId)
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
