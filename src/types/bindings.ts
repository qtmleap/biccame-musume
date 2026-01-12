import type { RateLimitBinding } from '@elithrar/workers-hono-rate-limit'
import type { PrismaClient } from '@prisma/client'

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
  /** PrismaClientインスタンス（ミドルウェアで初期化） */
  PRISMA: PrismaClient
  /** レート制限用のバインディング */
  RATE_LIMITER: RateLimitBinding
}
