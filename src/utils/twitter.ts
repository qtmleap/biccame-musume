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
 * 公式のお知らせツイート（type='announce'）を優先的に引用
 */
const getQuoteTweetId = (event: Event): string | undefined => {
  if (!event.referenceUrls || event.referenceUrls.length === 0) {
    return undefined
  }

  // type='announce'のURLを優先
  const announceUrl = event.referenceUrls.find((ref) => ref.type === 'announce')
  const targetUrl = announceUrl?.url || event.referenceUrls[0].url

  return extractTweetId(targetUrl) ?? undefined
}

/**
 * Twitter APIクライアントクラス
 * イベントのツイート投稿機能を提供
 */
export class Twitter {
  private oauth: OAuth
  // private isLocal: boolean

  constructor(private env: Bindings) {
    // this.isLocal = !env.ENVIRONMENT || env.ENVIRONMENT === 'local'

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
   * 引用ツイートが失敗した場合は通常のツイートにフォールバック
   */
  async tweet(text: string, quoteTweetId?: string): Promise<void> {
    // if (this.isLocal) {
    //   console.log('[Twitter] Skipping tweet in local environment. Would have sent:', {
    //     text,
    //     quoteTweetId
    //   })
    //   return
    // }

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

      const payload = {
        text: text,
        quote_tweet_id: quoteTweetId
      }

      console.log('[Twitter] Posting tweet with payload:', JSON.stringify(payload, null, 2))

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errorText = await response.text()

        // 403エラーで引用ツイートが禁止されている場合は通常のツイートにフォールバック
        if (response.status === 503 && quoteTweetId) {
          console.warn('[Twitter] Quote tweet not allowed, retrying without quote:', {
            quoteTweetId,
            error: errorText
          })
          return await this.tweet(text, undefined)
        }

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
