import type { RateLimitBinding } from '@elithrar/workers-hono-rate-limit'
import type { VerifyFirebaseAuthEnv } from '@hono/firebase-auth'

/**
 * Cloudflare Workersの環境変数の型定義
 */
export type Bindings = VerifyFirebaseAuthEnv & {
  /** 環境名 (prod, dev, local) */
  ENVIRONMENT?: string
  /** 投票データと制限チェックを保存するKVストア */
  VOTE_LIMITER: KVNamespace
  /** ページビュー統計を保存するKVストア */
  PAGE_VIEWS: KVNamespace
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
  /** FirebaseプロジェクトID */
  FIREBASE_PROJECT_ID: string
  /** Twitter投稿用 API Key (@_biccame_musume, OAuth 1.0a) */
  TWITTER_API_KEY: string
  /** Twitter投稿用 API Secret (@_biccame_musume, OAuth 1.0a) */
  TWITTER_API_SECRET: string
  /** Twitter投稿用 Access Token (@_biccame_musume, OAuth 1.0a) */
  TWITTER_ACCESS_TOKEN: string
  /** Twitter投稿用 Access Token Secret (@_biccame_musume, OAuth 1.0a) */
  TWITTER_ACCESS_SECRET: string
  /** Workers AI */
  AI: Ai
}

export type Variables = {
  CLIENT_IP: string
}
