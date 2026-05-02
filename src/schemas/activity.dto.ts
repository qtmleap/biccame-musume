import { z } from '@hono/zod-openapi'

/**
 * 店舗キーパラメータスキーマ
 */
export const StoreKeyParamSchema = z
  .object({
    storeKey: z.string().nonempty('店舗キーは必須です').openapi({ description: '店舗キー' })
  })
  .openapi('StoreKeyParam')

/**
 * イベントIDパラメータスキーマ
 */
export const EventIdParamSchema = z
  .object({
    eventId: z.string().nonempty('イベントIDは必須です').openapi({ description: 'イベントID' })
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
    error: z.string().nonempty('エラーメッセージは必須です').openapi({ description: 'エラーメッセージ' })
  })
  .openapi('ErrorResponse')

/**
 * 訪問済み店舗レスポンススキーマ
 */
export const StoresResponseSchema = z
  .object({
    stores: z.array(z.string().nonempty('店舗キーは必須です')).openapi({ description: '店舗キーの配列' })
  })
  .openapi('StoresResponse')

/**
 * イベント一覧レスポンススキーマ
 */
export const EventsResponseSchema = z
  .object({
    events: z.array(z.string().nonempty('イベントIDは必須です')).openapi({ description: 'イベントIDの配列' })
  })
  .openapi('EventsResponse')

/**
 * ユーザーアクティビティレスポンススキーマ
 */
export const UserActivityResponseSchema = z
  .object({
    stores: z.array(z.string().nonempty('店舗キーは必須です')).openapi({ description: '訪問済み店舗キーの配列' }),
    events: z
      .object({
        interested: z
          .array(z.string().nonempty('イベントIDは必須です'))
          .openapi({ description: '興味のあるイベントIDの配列' }),
        completed: z
          .array(z.string().nonempty('イベントIDは必須です'))
          .openapi({ description: '達成済みイベントIDの配列' })
      })
      .openapi({ description: 'イベント関連のアクティビティ' })
  })
  .openapi('UserActivityResponse')

/**
 * 店舗ステータス更新リクエストスキーマ
 */
export const UpdateStoreStatusSchema = z
  .object({
    status: z
      .enum(['visited', 'favorite', 'want_to_visit'], { error: '有効な店舗ステータスを選択してください' })
      .openapi({ description: '店舗のステータス' })
  })
  .openapi('UpdateStoreStatus')

/**
 * 店舗一覧クエリパラメータスキーマ
 */
export const StoresQuerySchema = z
  .object({
    status: z
      .enum(['visited', 'favorite', 'want_to_visit'], { error: '有効な店舗ステータスを選択してください' })
      .optional()
      .openapi({ description: '店舗のステータスフィルタ' })
  })
  .openapi('StoresQuery')

/**
 * イベントステータス更新リクエストスキーマ
 */
export const UpdateEventStatusSchema = z
  .object({
    status: z
      .enum(['interested', 'completed'], { error: '有効なイベントステータスを選択してください' })
      .openapi({ description: 'イベントのステータス' })
  })
  .openapi('UpdateEventStatus')

/**
 * イベント一覧クエリパラメータスキーマ
 */
export const EventsQuerySchema = z
  .object({
    status: z
      .enum(['interested', 'completed'], { error: '有効なイベントステータスを選択してください' })
      .optional()
      .openapi({ description: 'イベントのステータスフィルタ' })
  })
  .openapi('EventsQuery')

/**
 * イベント削除クエリパラメータスキーマ
 */
export const EventDeleteQuerySchema = z
  .object({
    status: z
      .enum(['interested', 'completed'], { error: '有効なイベントステータスを選択してください' })
      .openapi({ description: '削除するステータス' })
  })
  .openapi('EventDeleteQuery')


/**
 * ユーザーアクティビティ統合レスポンススキーマ（Zodiosクライアント用）
 */
export const UserActivitiesResponseSchema = z.object({
  stores: z.array(z.string().nonempty('店舗キーは必須です')),
  events: z.object({
    interested: z.array(z.string().nonempty('イベントIDは必須です')),
    completed: z.array(z.string().nonempty('イベントIDは必須です'))
  })
})

/**
 * ユーザーイベント一覧レスポンススキーマ（Zodiosクライアント用）
 */
export const UserEventsResponseSchema = z.object({
  events: z.array(z.string().nonempty('イベントIDは必須です'))
})

/**
 * ユーザー店舗一覧レスポンススキーマ（Zodiosクライアント用）
 */
export const UserStoresResponseSchema = z.object({
  stores: z.array(z.string().nonempty('店舗キーは必須です'))
})

/**
 * 成功レスポンススキーマ（Zodiosクライアント用）
 */
export const SuccessResponseSchemaForClient = z.object({
  success: z.boolean()
})
