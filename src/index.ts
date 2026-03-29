import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { proxy } from 'hono/proxy'
import { ZodError } from 'zod'
import authRoutes from './api/auth'
import direction from './api/direction'
import events from './api/event'
import me from './api/me'
import stats from './api/stats'
import users from './api/user'
import votes from './api/vote'
import type { Bindings, Variables } from './types/bindings'

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

app.use(
  '*',
  cors({
    origin: ['http://localhost:5173'],
    credentials: true,
    maxAge: 86400
  })
)

/** バージョン情報エンドポイント（認証不要） */
app.get('/api/version', (c) => {
  return c.json({
    version: __APP_VERSION__,
    hash: __GIT_HASH__,
    buildAt: __BUILD_AT__
  })
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

// 認証APIルート
app.route('/api/auth', authRoutes)

// イベント管理APIルート
app.route('/api/events', events)

// 投票APIルート
app.route('/api/votes', votes)

// ページビュー統計APIルート
app.route('/api/stats', stats)

// 経路案内APIルート
app.route('/api/directions', direction)

// ユーザー管理APIルート
app.route('/api/users', users)

// ユーザーアクティビティAPIルート
app.route('/api', me)

// 静的ファイル配信
app.use('*', async (_c, next) => {
  await next()
})

export default app
