import { Hono } from 'hono'
import events from './api/event'
import stats, { incrementPageView } from './api/stats'
import votes from './api/vote'
import type { Bindings, Variables } from './types/bindings'

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// ページビューカウント用ミドルウェア
app.use('*', async (c, next) => {
  await next()

  // HTMLレスポンス（ページ表示）の場合のみカウント
  const contentType = c.res.headers.get('Content-Type')
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
})

// イベント管理APIルート
app.route('/api/events', events)

// 投票APIルート
app.route('/api/votes', votes)

// ページビュー統計APIルート
app.route('/api/stats', stats)

// 静的ファイル配信
app.use('*', async (_c, next) => {
  await next()
})

export default app
