import type { RateLimitBinding } from '@elithrar/workers-hono-rate-limit'

/**
 * Cloudflare Workersの環境変数の型定義
 */
export type Bindings = {
  /** 投票データと制限チェックを保存するKVストア */
  VOTE_LIMITER: KVNamespace
  /** イベントデータを保存するKVストア（レガシー） */
  BICCAME_MUSUME_EVENTS: KVNamespace
  /** D1データベース */
  DB: D1Database
  /** Cloudflare Accessの認証ドメイン */
  CF_ACCESS_TEAM_DOMAIN: string
  /** Cloudflare AccessのAudience */
  CF_ACCESS_AUD: string
  /** レート制限用のバインディング */
  RATE_LIMITER: RateLimitBinding
  /** Twitter API Key */
  TWITTER_API_KEY: string
  /** Twitter API Secret */
  TWITTER_API_SECRET: string
  /** Twitter Access Token */
  TWITTER_ACCESS_TOKEN: string
  /** Twitter Access Token Secret */
  TWITTER_ACCESS_SECRET: string
}

export type Variables = {
  CLIENT_IP: string
}
