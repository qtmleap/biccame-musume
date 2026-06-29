import type { RateLimitBinding } from '@elithrar/workers-hono-rate-limit'
import type { VerifyFirebaseAuthEnv } from '@hono/firebase-auth'
import type { JwtVariables } from 'hono/jwt'
import type { JWTPayload } from 'hono/utils/jwt/types'
import type { StatsDO } from '@/durable-objects/stats'

/**
 * Cloudflare Workersの環境変数の型定義
 */
export type Bindings = VerifyFirebaseAuthEnv & {
  /** 環境名 (prod, dev, local) */
  ENVIRONMENT?: string
  /** 投票データと制限チェックを保存するKVストア */
  VOTE_LIMITER: KVNamespace
  /** ページビュー統計を保存するKVストア (StatsDO 移行中の dual-write 元) */
  PAGE_VIEWS: KVNamespace
  /** ページビュー統計の atomic 集計を行う Durable Object */
  STATS: DurableObjectNamespace<StatsDO>
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
  /** X (Twitter) Web セッションの auth_token cookie (@_biccame_musume) */
  TWITTER_AUTH_TOKEN: string
  /** X (Twitter) Web セッションの ct0 (CSRF) cookie (@_biccame_musume) */
  TWITTER_CSRF_TOKEN: string
  /** Workers AI */
  AI: Ai
  /** コメント投稿レート制限用バインディング */
  COMMENT_RATE_LIMITER: RateLimitBinding
  /** Cloudflare Turnstile シークレットキー */
  TURNSTILE_SECRET_KEY: string
  /** JWT秘密鍵 */
  JWT_SECRET_KEY: string
  /** 静的アセット配信バインディング */
  ASSETS: Fetcher
}

/**
 * JWTトークンに含まれるカスタムクレーム
 * FirebaseIdTokenから必要な情報を抽出して署名し直したもの
 */
export type CustomJwtClaims = JWTPayload & {
  uid: string
  usr: {
    email: string | null
    email_verified: boolean
    display_name: string | null
    thumbnail_url: string | null
  }
  pid: undefined
}

export type Variables = JwtVariables<CustomJwtClaims> & {
  CLIENT_IP: string
}
