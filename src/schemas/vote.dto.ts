import { z } from '@hono/zod-openapi'
import { BadgeSchema } from './badge.dto'

/**
 * 投票レスポンス（成功・エラー共通）
 */
export const VoteResponseSchema = z
  .object({
    success: z.boolean().openapi({ example: true }),
    message: z.string().nonempty('メッセージは必須です').openapi({ example: '投票ありがとうございます！' }),
    nextVoteDate: z.string().nonempty('次回投票日は必須です').openapi({ example: '2025-12-23' }),
    newBadges: z.array(BadgeSchema).default([]).openapi({ description: '今回新たに獲得したバッジの一覧' })
  })
  .openapi('VoteResponse')

export type VoteResponse = z.infer<typeof VoteResponseSchema>

/**
 * 投票カウント項目
 */
export const VoteCountItemSchema = z.object({
  key: z.string().nonempty('キーは必須です').openapi({ example: 'honten' }),
  count: z.number().openapi({ example: 42 })
})

/**
 * 投票カウント一覧
 */
export const VoteCountListSchema = z.array(VoteCountItemSchema)

/**
 * 一括投票リクエスト
 */
export const BulkVoteRequestSchema = z
  .object({
    characterIds: z
      .array(z.string().nonempty('キャラクターIDは必須です'))
      .min(1, 'キャラクターIDを1つ以上指定してください')
      .max(200, 'キャラクターIDは200個まで指定可能です')
      .openapi({ description: '投票対象のキャラクターIDの配列' })
  })
  .openapi('BulkVoteRequest')

/**
 * 一括投票結果アイテム
 */
export const BulkVoteResultItemSchema = z
  .object({
    characterId: z.string().nonempty('キャラクターIDは必須です').openapi({ example: 'biccame-001' }),
    /// voted: 新規投票成功 / skipped: 本日投票済み
    status: z.enum(['voted', 'skipped']).openapi({ description: '投票結果ステータス' })
  })
  .openapi('BulkVoteResultItem')

/**
 * 一括投票レスポンス
 */
export const BulkVoteResponseSchema = z
  .object({
    success: z.boolean().openapi({ example: true }),
    /// 投票結果の内訳
    results: z.array(BulkVoteResultItemSchema).openapi({ description: 'キャラクター別の投票結果' }),
    /// 新規投票数
    votedCount: z.number().openapi({ example: 3 }),
    /// 投票済みでスキップされた数
    skippedCount: z.number().openapi({ example: 1 }),
    nextVoteDate: z.string().nonempty('次回投票日は必須です').openapi({ example: '2026-05-06' }),
    newBadges: z.array(BadgeSchema).default([]).openapi({ description: '今回新たに獲得したバッジの一覧' })
  })
  .openapi('BulkVoteResponse')

export type BulkVoteResponse = z.infer<typeof BulkVoteResponseSchema>

/**
 * Zodios クライアント用
 */
export const BulkVoteResponseSchemaForClient = z.object({
  success: z.boolean(),
  results: z.array(
    z.object({
      characterId: z.string().nonempty(),
      status: z.enum(['voted', 'skipped'])
    })
  ),
  votedCount: z.number(),
  skippedCount: z.number(),
  nextVoteDate: z.string().nonempty(),
  newBadges: z.array(BadgeSchema).default([])
})
