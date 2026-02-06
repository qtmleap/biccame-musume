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
 * イベントから引用RT用のツイートIDを抽出
 */
const getQuoteTweetId = (event: Event): string | undefined => {
  const urls = event.referenceUrls?.map((ref) => ref.url) || []
  const url = urls.at(-1)
  if (url === undefined) {
    return undefined
  }
  return extractTweetId(url) ?? undefined
}

/**
 * Twitter APIクライアントクラス
 * イベントのツイート投稿機能を提供
 */
export class Twitter {
  private client: TwitterApi | null = null
  private isLocal: boolean

  constructor(private env: Bindings) {
    this.isLocal = !env.ENVIRONMENT || env.ENVIRONMENT === 'local'
  }

  /**
   * Twitter APIクライアントを取得（遅延初期化）
   */
  private getClient(): TwitterApi {
    if (this.client) {
      return this.client
    }

    const { TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET } = this.env

    if (!TWITTER_API_KEY || !TWITTER_API_SECRET || !TWITTER_ACCESS_TOKEN || !TWITTER_ACCESS_SECRET) {
      throw new Error('[Twitter] API credentials not configured')
    }

    this.client = new TwitterApi({
      appKey: TWITTER_API_KEY,
      appSecret: TWITTER_API_SECRET,
      accessToken: TWITTER_ACCESS_TOKEN,
      accessSecret: TWITTER_ACCESS_SECRET
    })

    return this.client
  }

  /**
   * 認証情報が設定されているか確認
   */
  hasCredentials(): boolean {
    const { TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET } = this.env
    return !!(TWITTER_API_KEY && TWITTER_API_SECRET && TWITTER_ACCESS_TOKEN && TWITTER_ACCESS_SECRET)
  }

  /**
   * ツイートを投稿
   */
  async tweet(text: string, quoteTweetId?: string): Promise<void> {
    if (!this.hasCredentials()) {
      console.warn('[Twitter] API credentials not configured. Skipping tweet.')
      return
    }

    if (this.isLocal) {
      console.log('[Twitter] Skipping tweet in local environment. Would have sent:', {
        text,
        quoteTweetId
      })
      return
    }

    const client = this.getClient()

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
  async tweetEventCreated(event: Event): Promise<void> {
    const text = generateTweetText(event, false)
    const quoteTweetId = getQuoteTweetId(event)
    await this.tweet(text, quoteTweetId)
  }

  /**
   * イベント更新時にツイートを投稿
   */
  async tweetEventUpdated(event: Event): Promise<void> {
    const text = generateTweetText(event, true)
    const quoteTweetId = getQuoteTweetId(event)
    await this.tweet(text, quoteTweetId)
  }
}
