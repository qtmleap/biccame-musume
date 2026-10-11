import { isAllowedOrigin } from '@api/lib/allowed-origin'
import { rewriteIndexHtml } from '@api/middleware/og-rewrite'
import admin from '@api/routes/admin/index'
import authRoutes from '@api/routes/auth'
import badges from '@api/routes/badge'
import comments from '@api/routes/comment'
import direction from '@api/routes/direction'
import events from '@api/routes/event'
import eventGroups from '@api/routes/event-group'
import favorite from '@api/routes/favorite'
import me from '@api/routes/me'
import og from '@api/routes/og'
import search from '@api/routes/search'
import stats from '@api/routes/stats'
import users from '@api/routes/user'
import version from '@api/routes/version'
import votes from '@api/routes/vote'
import webhookX from '@api/routes/webhook-x'
import { runBadgeCron } from '@api/services/badge-cron'
import { handleWebhookQueue } from '@api/services/webhook-process'
import type { Bindings, Variables } from '@api/types/bindings'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { csrf } from 'hono/csrf'
import { HTTPException } from 'hono/http-exception'
import { proxy } from 'hono/proxy'
import { secureHeaders } from 'hono/secure-headers'
import { ZodError } from 'zod'

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

app.use(
  '*',
  cors({
    origin: ['http://localhost:15175'],
    credentials: true,
    maxAge: 86400
  })
)

// セキュリティヘッダ (XSS/Clickjacking/MIME sniffing 対策のベースライン)。
// CSP は Google Maps / Firebase / Twitter 画像など多数のオリジンが絡むため
// Report-Only モードで段階導入する。 本番で違反ログを集めて、 問題なければ Enforce に切替予定。
//
// 含まれているオリジンの根拠:
// - Firebase Auth (OAuth redirect): apis.google.com / *.googleapis.com / accounts.google.com /
//   *.firebaseapp.com / securetoken.googleapis.com
// - Google Maps: maps.googleapis.com / maps.gstatic.com
// - Twitter プロフィール画像: pbs.twimg.com
// - 認証 redirect helper: biccame-musume.firebaseapp.com
//
// CORP/COOP はデフォルトで same-origin が付与されるが、og:image を X / Bluesky 等の
// クローラーから cross-origin 参照させる必要があるため明示的に無効化する。
// SharedArrayBuffer も使っていないので isolation 系は不要。
app.use(
  '*',
  secureHeaders({
    xContentTypeOptions: 'nosniff',
    xFrameOptions: 'SAMEORIGIN',
    referrerPolicy: 'strict-origin-when-cross-origin',
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false,
    permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
    contentSecurityPolicyReportOnly: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        // Firebase / Google sign-in
        'https://apis.google.com',
        'https://www.gstatic.com',
        'https://accounts.google.com',
        // Google Maps
        'https://maps.googleapis.com',
        // Cloudflare Web Analytics (有効化されていれば使う)
        'https://static.cloudflareinsights.com'
      ],
      styleSrc: [
        "'self'",
        // Tailwind / Radix / sonner は inline style を多用するため一旦許容 (Report-Only で観測)
        "'unsafe-inline'",
        'https://fonts.googleapis.com'
      ],
      imgSrc: [
        "'self'",
        'data:',
        'blob:',
        // Google avatar (Firebase Auth login user thumbnail)
        'https://lh3.googleusercontent.com',
        'https://*.googleusercontent.com',
        // Twitter avatar
        'https://pbs.twimg.com',
        // Google Maps
        'https://maps.gstatic.com',
        'https://maps.googleapis.com',
        // GitHub avatar (Firebase GitHub provider)
        'https://avatars.githubusercontent.com'
      ],
      fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
      connectSrc: [
        "'self'",
        'https://*.googleapis.com',
        'https://*.firebaseio.com',
        'https://identitytoolkit.googleapis.com',
        'https://securetoken.googleapis.com',
        'https://maps.googleapis.com'
      ],
      frameSrc: [
        // Firebase Auth helper (popup / iframe)
        'https://biccame-musume.firebaseapp.com',
        'https://accounts.google.com'
      ],
      workerSrc: ["'self'", 'blob:'],
      manifestSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  })
)

// CSRF 対策 (Cookie-JWT 認証を持つミューテーション経路すべてに一括適用)
const csrfProtection = csrf({ origin: (origin, c) => isAllowedOrigin(origin, c.env) })
app.use('/api/*', async (c, next) => {
  // Webhook は Cookie 認証を使わず、生本文の HMAC で認証する。
  if (c.req.method === 'POST' && c.req.path === '/api/webhook') return next()
  return csrfProtection(c, next)
})
app.route('/api/webhook', webhookX)

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

// イベントグループAPIルート
app.route('/api/event-groups', eventGroups)

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

// お気に入りキャラクターAPIルート
app.route('/api', favorite)

// バッジAPIルート
app.route('/api', badges)

// 管理者 API (badges / comments / users / twitter)
// CFAuth は src/api/admin/index.ts で `/admin/*` 全体に 1 度だけ適用される
app.route('/api', admin)

// Event の OG 画像をランタイム生成 (asset middleware より前に置く)
app.route('/og', og)

/**
 * 静的ファイル配信 & SPA フォールバック + OGP 動的書き換え
 *
 * - 静的アセット (拡張子付き) は ASSETS バインディングがそのまま返す
 * - HTML を返すリクエストは renderRewrittenIndex 経由で OG/Twitter Card メタを差し替える
 *   ことで X / Bluesky 等のクローラーがページ別カードを生成できるようにする
 */
app.use('*', async (c, next) => {
  if (c.req.path.startsWith('/api/') || c.req.path.startsWith('/__/')) {
    return next()
  }

  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    return next()
  }

  const assetResponse = await c.env.ASSETS.fetch(c.req.raw)
  const contentType = assetResponse.headers.get('content-type') ?? ''

  if (assetResponse.ok && contentType.includes('text/html')) {
    return rewriteIndexHtml(c, assetResponse)
  }

  return assetResponse
})

const scheduled: ExportedHandlerScheduledHandler<Bindings> = async (event, env, ctx) => {
  if (event.cron !== '0 0 * * *') {
    console.warn('[Cron] Unknown app cron; skipped')
    return
  }
  const scheduledAt = new Date(event.scheduledTime)
  ctx.waitUntil(runBadgeCron(env, scheduledAt))
}

export { StatsDO } from '@api/durable-objects/stats'
export { UserPushDO } from '@api/durable-objects/user-push'
export { VoteCounterDO } from '@api/durable-objects/vote-counter'
export { AppBotReadService } from '@api/rpc/bot-read'

export default { fetch: app.fetch, scheduled, queue: handleWebhookQueue }
