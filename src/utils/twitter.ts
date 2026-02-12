import crypto from 'node:crypto'
import OAuth from 'oauth-1.0a'
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
  private oauth: OAuth
  private isLocal: boolean

  constructor(private env: Bindings) {
    this.isLocal = !env.ENVIRONMENT || env.ENVIRONMENT === 'local'

    // OAuth 1.0aクライアントを初期化
    this.oauth = new OAuth({
      consumer: {
        key: env.TWITTER_API_KEY,
        secret: env.TWITTER_API_SECRET
      },
      signature_method: 'HMAC-SHA1',
      hash_function(baseString, key) {
        return crypto.createHmac('sha1', key).update(baseString).digest('base64')
      }
    })
  }

  /**
   * ツイートを投稿
   */
  async tweet(text: string, quoteTweetId?: string): Promise<void> {
    if (this.isLocal) {
      console.log('[Twitter] Skipping tweet in local environment. Would have sent:', {
        text,
        quoteTweetId
      })
      return
    }

    const { TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET } = this.env

    try {
      const url = 'https://api.twitter.com/2/tweets'

      // OAuth 1.0a認証ヘッダーを生成
      const headers = this.oauth.toHeader(
        this.oauth.authorize(
          {
            url,
            method: 'POST'
          },
          {
            key: TWITTER_ACCESS_TOKEN,
            secret: TWITTER_ACCESS_SECRET
          }
        )
      )

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: text,
          quote_tweet_id: quoteTweetId
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Twitter API error: ${response.status} ${errorText}`)
      }

      const result = await response.json()
      console.log('[Twitter] Tweet posted successfully:', result)
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
