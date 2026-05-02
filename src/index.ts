import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { proxy } from 'hono/proxy'
import { ZodError } from 'zod'
import authRoutes from './api/auth'
import comments from './api/comment'
import direction from './api/direction'
import events from './api/event'
import me from './api/me'
import search from './api/search'
import stats from './api/stats'
import users from './api/user'
import version from './api/version'
import votes from './api/vote'
import type { Bindings, Variables } from './types/bindings'

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

app.use(
  '*',
  cors({
    origin: ['http://localhost:15175'],
    credentials: true,
    maxAge: 86400
  })
)

/**
 * /admin/* の HTML は CDN キャッシュさせない
 * Cloudflare Access の認証 Cookie が切れた状態でキャッシュヒットすると
 * 未認証のまま管理画面がレンダリングされうるため
 */
app.get('/admin/*', async (c) => {
  const assetResponse = await c.env.ASSETS.fetch(c.req.raw)
  const response = new Response(assetResponse.body, {
    status: assetResponse.status,
    headers: assetResponse.headers
  })
  response.headers.set('Cache-Control', 'private, no-store, must-revalidate')
  return response
})

/** Firebase認証ヘルパーのリバースプロキシ（最優先で処理） */
app.all('/__/auth/*', (c) => {
  const url = new URL(c.req.url)
  const proxyUrl = `https://biccame-musume.firebaseapp.com${url.pathname}${url.search}`
  return proxy(proxyUrl, {
    ...c.req,
    headers: {
      ...c.req.header(),
      host: 'biccame-musume.firebaseapp.com'
    }
  })
})

app.onError(async (error, c) => {
  console.error(error)
  if (error instanceof HTTPException) {
    return c.json({ message: error.message }, error.status)
  }
  if (error instanceof ZodError) {
    return c.json({ message: 'ZodError', description: error.issues }, 400)
  }
  return c.json({ message: 'Unknown Error' }, 500)
})

// バージョン情報APIルート
app.route('/api/version', version)

// 認証APIルート
app.route('/api/auth', authRoutes)

// イベント管理APIルート
app.route('/api/events', events)

// イベントコメントAPIルート
app.route('/api/events', comments)

// 投票APIルート
app.route('/api/votes', votes)

// ページビュー統計APIルート
app.route('/api/stats', stats)

// 経路案内APIルート
app.route('/api/directions', direction)

// イベント検索APIルート
app.route('/api/search', search)

// ユーザー管理APIルート
app.route('/api/users', users)

// ユーザーアクティビティAPIルート
app.route('/api', me)

// 静的ファイル配信 & SPA フォールバック
app.use('*', async (c, next) => {
  await next()
  // API・認証以外で404の場合、index.htmlにフォールバック（SPA対応）
  if (c.res.status === 404 && !c.req.path.startsWith('/api/') && !c.req.path.startsWith('/__/')) {
    try {
      const assetResponse = await c.env.ASSETS.fetch(new Request(new URL('/', c.req.url), c.req.raw))
      if (assetResponse.ok) {
        c.res = new Response(assetResponse.body, {
          status: 200,
          headers: assetResponse.headers
        })
      }
    } catch {
      // ASSETS が利用できない場合（devサーバーなど）はそのまま
    }
  }
})

export default app
