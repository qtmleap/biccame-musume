import {
  AccountsResponseSchema,
  EventDetailResponseSchema,
  EventsResponseSchema,
  GapsResponseSchema,
  KeywordsRequestSchema,
  KeywordsResponseSchema,
  LabelRequestSchema,
  LabelResponseSchema,
  PostQuerySchema,
  PostsResponseSchema,
  SummarySchema
} from '@biccame/shared/event-detect/viewer'
import { makeApi } from '@zodios/core'
import { z } from 'zod'

/**
 * イベント検出ビューワの API（workers/app/src/api/admin-event-detect.ts。形は packages/shared の viewer.ts）。
 * 読むのは D1 の event_detect_* で、bun run event-detect export で入れる。
 */
export const eventDetectEndpoints = makeApi([
  {
    method: 'get',
    path: '/api/admin/event-detect/summary',
    alias: 'getEventDetectSummary',
    description: 'ファネル・正解データの概況',
    response: SummarySchema
  },
  {
    method: 'get',
    path: '/api/admin/event-detect/accounts',
    alias: 'getEventDetectAccounts',
    description: '店舗アカウント別の件数',
    response: AccountsResponseSchema
  },
  {
    method: 'get',
    path: '/api/admin/event-detect/posts',
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
      { name: 'offset', type: 'Query', schema: z.number().int().nonnegative() },
      { name: 'limit', type: 'Query', schema: z.number().int().positive().max(500) }
    ],
    response: PostsResponseSchema
  },
  {
    method: 'get',
    path: '/api/admin/event-detect/events',
    alias: 'getEventDetectEvents',
    description: 'D1 イベント一覧',
    response: EventsResponseSchema
  },
  {
    method: 'get',
    path: '/api/admin/event-detect/events/:id',
    alias: 'getEventDetectEvent',
    description: 'D1 イベント詳細と関連投稿',
    response: EventDetailResponseSchema
  },
  {
    method: 'get',
    path: '/api/admin/event-detect/gaps',
    alias: 'getEventDetectGaps',
    description: '登録漏れ候補',
    response: GapsResponseSchema
  },
  {
    method: 'get',
    path: '/api/admin/event-detect/keywords',
    alias: 'getEventDetectKeywords',
    description: 'キーワード・除外語の統計',
    response: KeywordsResponseSchema
  },
  {
    method: 'post',
    path: '/api/admin/event-detect/keywords',
    alias: 'setEventDetectKeywords',
    description: '無効にするキーワード・除外語を渡して統計を取り直す（サーバーは状態を持たない）',
    parameters: [{ name: 'body', type: 'Body', schema: KeywordsRequestSchema }],
    response: KeywordsResponseSchema
  },
  {
    method: 'put',
    path: '/api/admin/event-detect/labels/:id',
    alias: 'setEventDetectLabel',
    description: '投稿に手動ラベルを付ける',
    parameters: [{ name: 'body', type: 'Body', schema: LabelRequestSchema }],
    response: LabelResponseSchema
  },
  {
    method: 'delete',
    path: '/api/admin/event-detect/labels/:id',
    alias: 'deleteEventDetectLabel',
    description: '投稿の手動ラベルを外す',
    response: LabelResponseSchema
  }
])
