import { ChartsResponseSchema } from '@biccame/shared/event-detect/charts'
import {
  AccountsResponseSchema,
  EMULATED_SORTS,
  EmulatedDetailResponseSchema,
  EmulatedQuerySchema,
  EmulatedResponseSchema,
  EventDetailResponseSchema,
  EventsResponseSchema,
  GapsResponseSchema,
  KeywordsRequestSchema,
  KeywordsResponseSchema,
  LabelRequestSchema,
  LabelResponseSchema,
  PostQuerySchema,
  PostsResponseSchema,
  PROBABILITY_BIN_COUNT,
  SummarySchema
} from '@biccame/shared/event-detect/viewer'
import { makeApi } from '@zodios/core'
import { z } from 'zod'

/**
 * イベント検出ビューワの API。ローカルで `bun run event-detect serve` が配信し、vite の dev 中継（/__event-detect）経由で呼ぶ。
 * 形は packages/shared の viewer.ts。本番の Worker には無いので、画面側も dev 専用として扱う。
 */
export const eventDetectEndpoints = makeApi([
  {
    method: 'get',
    path: '/__event-detect/api/summary',
    alias: 'getEventDetectSummary',
    description: '絞り込みの段階・正解データの概況',
    response: SummarySchema
  },
  {
    method: 'get',
    path: '/__event-detect/api/accounts',
    alias: 'getEventDetectAccounts',
    description: '店舗アカウント別の件数',
    response: AccountsResponseSchema
  },
  {
    method: 'get',
    path: '/__event-detect/api/charts',
    alias: 'getEventDetectCharts',
    description: 'チャート画面の集計（確率のヒストグラム・月別の件数・店舗別）',
    response: ChartsResponseSchema
  },
  {
    method: 'get',
    path: '/__event-detect/api/posts',
    alias: 'getEventDetectPosts',
    description: '投稿一覧',
    parameters: [
      { name: 'scope', type: 'Query', schema: PostQuerySchema.shape.scope },
      { name: 'account', type: 'Query', schema: PostQuerySchema.shape.account },
      { name: 'reason', type: 'Query', schema: PostQuerySchema.shape.reason },
      { name: 'q', type: 'Query', schema: PostQuerySchema.shape.q },
      { name: 'from', type: 'Query', schema: PostQuerySchema.shape.from },
      { name: 'until', type: 'Query', schema: PostQuerySchema.shape.until },
      { name: 'dedup', type: 'Query', schema: PostQuerySchema.shape.dedup },
      { name: 'judge', type: 'Query', schema: PostQuerySchema.shape.judge },
      // PostQuerySchema の bin は URL の文字列を数値へ変える（coerce）ので、送る側は数値だけを受ける
      {
        name: 'bin',
        type: 'Query',
        schema: z
          .number()
          .int()
          .min(0)
          .max(PROBABILITY_BIN_COUNT - 1)
          .optional()
      },
      { name: 'offset', type: 'Query', schema: z.number().int().nonnegative() },
      { name: 'limit', type: 'Query', schema: z.number().int().positive().max(500) }
    ],
    response: PostsResponseSchema
  },
  {
    method: 'get',
    path: '/__event-detect/api/events',
    alias: 'getEventDetectEvents',
    description: 'D1 イベント一覧',
    response: EventsResponseSchema
  },
  {
    method: 'get',
    path: '/__event-detect/api/events/:id',
    alias: 'getEventDetectEvent',
    description: 'D1 イベント詳細と関連投稿',
    response: EventDetailResponseSchema
  },
  {
    method: 'get',
    path: '/__event-detect/api/gaps',
    alias: 'getEventDetectGaps',
    description: '登録漏れ候補',
    response: GapsResponseSchema
  },
  {
    method: 'get',
    path: '/__event-detect/api/emulated',
    alias: 'getEventDetectEmulated',
    description: 'LLM イベント一覧',
    parameters: [
      // EmulatedQuerySchema の year は URL の文字列を数値へ変える（coerce）ので、送る側は数値だけを受ける
      { name: 'year', type: 'Query', schema: z.number().int().optional() },
      { name: 'store', type: 'Query', schema: EmulatedQuerySchema.shape.store },
      { name: 'status', type: 'Query', schema: EmulatedQuerySchema.shape.status },
      { name: 'ended', type: 'Query', schema: EmulatedQuerySchema.shape.ended },
      { name: 'd1', type: 'Query', schema: EmulatedQuerySchema.shape.d1 },
      { name: 'q', type: 'Query', schema: EmulatedQuerySchema.shape.q },
      { name: 'sort', type: 'Query', schema: z.enum(EMULATED_SORTS).optional() },
      { name: 'order', type: 'Query', schema: EmulatedQuerySchema.shape.order },
      { name: 'offset', type: 'Query', schema: z.number().int().nonnegative() },
      { name: 'limit', type: 'Query', schema: z.number().int().positive().max(500) }
    ],
    response: EmulatedResponseSchema
  },
  {
    method: 'get',
    path: '/__event-detect/api/emulated/:id',
    alias: 'getEventDetectEmulatedEvent',
    description: 'LLM イベント詳細と言及',
    response: EmulatedDetailResponseSchema
  },
  {
    method: 'get',
    path: '/__event-detect/api/keywords',
    alias: 'getEventDetectKeywords',
    description: 'キーワード・除外語の統計',
    response: KeywordsResponseSchema
  },
  {
    method: 'post',
    path: '/__event-detect/api/keywords',
    alias: 'setEventDetectKeywords',
    description: '無効にするキーワード・除外語を設定（サーバーの再起動で戻る）',
    parameters: [{ name: 'body', type: 'Body', schema: KeywordsRequestSchema }],
    response: KeywordsResponseSchema
  },
  {
    method: 'put',
    path: '/__event-detect/api/labels/:id',
    alias: 'setEventDetectLabel',
    description: '投稿に手動ラベルを付ける',
    parameters: [{ name: 'body', type: 'Body', schema: LabelRequestSchema }],
    response: LabelResponseSchema
  },
  {
    method: 'delete',
    path: '/__event-detect/api/labels/:id',
    alias: 'deleteEventDetectLabel',
    description: '投稿の手動ラベルを外す',
    response: LabelResponseSchema
  }
])
