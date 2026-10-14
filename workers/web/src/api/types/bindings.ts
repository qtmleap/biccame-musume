import type { StatsDO } from '@api/durable-objects/stats'
import type { UserPushDO } from '@api/durable-objects/user-push'
import type { VoteCounterDO } from '@api/durable-objects/vote-counter'
import type { SocialQueueMessage } from '@biccame/shared/social'
import type { RateLimitBinding } from '@elithrar/workers-hono-rate-limit'
import type { VerifyFirebaseAuthEnv } from '@hono/firebase-auth'
import type { JwtVariables } from 'hono/jwt'
import type { JWTPayload } from 'hono/utils/jwt/types'

/**
 * Cloudflare Workersの環境変数の型定義
 */
export type Bindings = VerifyFirebaseAuthEnv & {
  /** 環境名 (prod, dev, local) */
  ENVIRONMENT?: string
  /** 投稿は本番で明示的に有効化する */
  X_POSTING_ENABLED?: string
  X_ACCOUNT_READ_ENABLED?: string
  DISCORD_POSTING_ENABLED?: string
  TWITTER_AUTH_TOKEN?: string
  TWITTER_CSRF_TOKEN?: string
  DISCORD_TOKEN?: string
  DISCORD_CHANNEL_ID?: string
  DISCORD_WEBHOOK_URL?: string
  /** "true" のとき投票の 1 日 1 回制限を迂回する（ローカル開発用） */
  VOTE_LIMIT_BYPASS?: string
  /** ページビュー統計の atomic 集計を行う Durable Object */
  STATS: DurableObjectNamespace<StatsDO>
  /** ユーザーごとの WebSocket Hibernation 接続を保持する Durable Object */
  USER_PUSH: DurableObjectNamespace<UserPushDO>
  /** 年スコープごとの投票カウンタを in-memory 集計する Durable Object */
  VOTE_COUNTER: DurableObjectNamespace<VoteCounterDO>
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
  /** Workers AI */
  AI: Ai
  /** 配布イベント抽出とタイトル生成のClaude接続先（secret。未設定なら抽出は失敗し、登録しない） */
  ANTHROPIC_BASE_URL?: string
  /** 同・認証トークン（secret） */
  ANTHROPIC_AUTH_TOKEN?: string
  /** X Webhook の生本文署名用シークレット */
  WEBHOOK_SECRET_KEY?: string
  EVENT_DETECTION_QUEUE?: Queue<{ postId: string } | SocialQueueMessage>
  EVENT_DETECTION_MODEL?: string
  EVENT_DETECTION_THRESHOLD?: string
  EVENT_DETECTION_IGNORE_THRESHOLD?: string
  EVENT_DETECTION_CHOICE_THRESHOLD?: string
  /** コメント投稿レート制限用バインディング */
  COMMENT_RATE_LIMITER: RateLimitBinding
  /** 経路検索レート制限用バインディング（IPごと10件/60秒） */
  DIRECTIONS_RATE_LIMITER: RateLimitBinding
  /** JWT秘密鍵 */
  JWT_SECRET_KEY: string
  /** 静的アセット配信バインディング */
  ASSETS: Fetcher
  /** CSRF 許可オリジン (カンマ区切りの絶対オリジン) */
  ORIGIN_ALLOWLIST?: string
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
}

export type Variables = JwtVariables<CustomJwtClaims> & {
  CLIENT_IP: string
}
