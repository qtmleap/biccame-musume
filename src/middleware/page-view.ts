import type { MiddlewareHandler } from 'hono'
import { incrementPageView } from '@/api/stats'
import type { Bindings, Variables } from '@/types/bindings'

/**
 * ページビューカウント用ミドルウェア
 * HTMLレスポンスの場合のみページビューをインクリメント
 */
export const trackPageViews = (): MiddlewareHandler<{
  Bindings: Bindings
  Variables: Variables
}> => {
  return async (c, next) => {
    await next()

    console.log('[PageView] Tracking page view')
    // HTMLレスポンス（ページ表示）の場合のみカウント
    const contentType = c.res.headers.get('Content-Type')
    console.log('[PageView] Content-Type:', contentType, c.req.path)
    if (contentType?.includes('text/html')) {
      const url = new URL(c.req.url)
      const path = url.pathname

      // API呼び出しでないページのみカウント
      if (!path.startsWith('/api/')) {
        try {
          await incrementPageView(c.env, path)
        } catch (error) {
          console.error('[PageView] Failed to increment:', error)
        }
      }
    }
  }
}
