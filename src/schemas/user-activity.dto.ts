import { z } from '@hono/zod-openapi'

/**
 * ユーザーIDパラメータスキーマ
 */
export const UserActivityUserIdParamSchema = z
  .object({
    userId: z.string().openapi({ description: 'Firebase Auth UID' })
  })
  .openapi('UserActivityUserIdParam')

/**
 * 店舗キーパラメータスキーマ
 */
export const StoreKeyParamSchema = z
  .object({
    userId: z.string().openapi({ description: 'Firebase Auth UID' }),
    storeKey: z.string().openapi({ description: '店舗キー' })
  })
  .openapi('StoreKeyParam')

/**
 * イベントIDパラメータスキーマ
 */
export const EventIdParamSchema = z
  .object({
    userId: z.string().openapi({ description: 'Firebase Auth UID' }),
    eventId: z.string().openapi({ description: 'イベントID' })
  })
  .openapi('EventIdParam')

/**
 * 成功レスポンススキーマ
 */
export const SuccessResponseSchema = z
  .object({
    success: z.boolean().openapi({ description: '成功フラグ' })
  })
  .openapi('SuccessResponse')

/**
 * エラーレスポンススキーマ
 */
export const ErrorResponseSchema = z
  .object({
    error: z.string().openapi({ description: 'エラーメッセージ' })
  })
  .openapi('ErrorResponse')

/**
 * 訪問済み店舗レスポンススキーマ
 */
export const StoresResponseSchema = z
  .object({
    stores: z.array(z.string()).openapi({ description: '店舗キーの配列' })
  })
  .openapi('StoresResponse')

/**
 * イベント一覧レスポンススキーマ
 */
export const EventsResponseSchema = z
  .object({
    events: z.array(z.string()).openapi({ description: 'イベントIDの配列' })
  })
  .openapi('EventsResponse')

/**
 * ユーザーアクティビティレスポンススキーマ
 */
export const UserActivityResponseSchema = z
  .object({
    visitedStores: z.array(z.string()).openapi({ description: '訪問済み店舗キーの配列' }),
    interestedEvents: z.array(z.string()).openapi({ description: '興味のあるイベントIDの配列' }),
    completedEvents: z.array(z.string()).openapi({ description: '達成済みイベントIDの配列' })
  })
  .openapi('UserActivityResponse')

export type UserActivityResponse = z.infer<typeof UserActivityResponseSchema>
export type StoresResponse = z.infer<typeof StoresResponseSchema>
export type EventsResponse = z.infer<typeof EventsResponseSchema>
