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
    stores: z.array(z.string()).openapi({ description: '訪問済み店舗キーの配列' }),
    interestedEvents: z.array(z.string()).openapi({ description: '興味のあるイベントIDの配列' }),
    completedEvents: z.array(z.string()).openapi({ description: '達成済みイベントIDの配列' })
  })
  .openapi('UserActivityResponse')

/**
 * 店舗ステータス更新リクエストスキーマ
 */
export const UpdateStoreStatusSchema = z
  .object({
    status: z.enum(['visited', 'favorite', 'want_to_visit']).openapi({ description: '店舗のステータス' })
  })
  .openapi('UpdateStoreStatus')

/**
 * 店舗一覧クエリパラメータスキーマ
 */
export const StoresQuerySchema = z
  .object({
    status: z
      .enum(['visited', 'favorite', 'want_to_visit'])
      .optional()
      .openapi({ description: '店舗のステータスフィルタ' })
  })
  .openapi('StoresQuery')

/**
 * イベントステータス更新リクエストスキーマ
 */
export const UpdateEventStatusSchema = z
  .object({
    status: z.enum(['interested', 'completed']).openapi({ description: 'イベントのステータス' })
  })
  .openapi('UpdateEventStatus')

/**
 * イベント一覧クエリパラメータスキーマ
 */
export const EventsQuerySchema = z
  .object({
    status: z.enum(['interested', 'completed']).optional().openapi({ description: 'イベントのステータスフィルタ' })
  })
  .openapi('EventsQuery')

export type UserActivityResponse = z.infer<typeof UserActivityResponseSchema>
export type StoresResponse = z.infer<typeof StoresResponseSchema>
export type EventsResponse = z.infer<typeof EventsResponseSchema>
export type UpdateStoreStatus = z.infer<typeof UpdateStoreStatusSchema>
export type UpdateEventStatus = z.infer<typeof UpdateEventStatusSchema>
export type EventsQuery = z.infer<typeof EventsQuerySchema>

/**
 * ユーザーアクティビティ統合レスポンススキーマ（Zodiosクライアント用）
 */
export const UserActivitiesResponseSchema = z.object({
  stores: z.array(z.string().nonempty()),
  interestedEvents: z.array(z.string().nonempty()),
  completedEvents: z.array(z.string().nonempty())
})

/**
 * ユーザーイベント一覧レスポンススキーマ（Zodiosクライアント用）
 */
export const UserEventsResponseSchema = z.object({
  events: z.array(z.string().nonempty())
})

/**
 * ユーザー店舗一覧レスポンススキーマ（Zodiosクライアント用）
 */
export const UserStoresResponseSchema = z.object({
  stores: z.array(z.string().nonempty())
})

/**
 * 成功レスポンススキーマ（Zodiosクライアント用）
 */
export const SuccessResponseSchemaForClient = z.object({
  success: z.boolean()
})

export type UserActivitiesResponse = z.infer<typeof UserActivitiesResponseSchema>
export type UserEventsResponse = z.infer<typeof UserEventsResponseSchema>
export type UserStoresResponse = z.infer<typeof UserStoresResponseSchema>
