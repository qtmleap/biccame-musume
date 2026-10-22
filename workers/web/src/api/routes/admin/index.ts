import { CFAuth } from '@api/middleware/cloudflare-access'
import adminBadges from '@api/routes/admin-badge'
import adminBot from '@api/routes/admin-bot'
import adminComments from '@api/routes/admin-comment'
import adminEvents from '@api/routes/admin-event'
import adminEventDetect from '@api/routes/admin-event-detect'
import adminEventDetectExtract from '@api/routes/admin-event-detect-extract'
import adminEventGroups from '@api/routes/admin-event-group'
import adminTwitter from '@api/routes/admin-twitter'
import adminUsers from '@api/routes/admin-user'
import adminWebhook from '@api/routes/admin-webhook'
import type { Bindings } from '@api/types/bindings'
import { OpenAPIHono } from '@hono/zod-openapi'

/**
 * 管理者向けエンドポイントのサブグループ。
 *
 * `/api/admin/*` 全体に Cloudflare Access (`CFAuth`) ミドルウェアを 1 箇所で適用し、
 * 個別 admin-* ルーターでは `middleware: [CFAuth]` を持たない。
 *
 * src/index.ts からは `app.route('/api', admin)` の 1 行で登録される。
 * (admin ルーターはユーザー JWT を使わないため Variables は不要)
 */
const admin = new OpenAPIHono<{ Bindings: Bindings }>()

admin.use('/admin/*', CFAuth)

admin.route('/', adminBadges)
admin.route('/', adminComments)
admin.route('/', adminEvents)
admin.route('/', adminEventDetect)
admin.route('/', adminEventDetectExtract)
admin.route('/', adminEventGroups)
admin.route('/', adminUsers)
admin.route('/', adminTwitter)
admin.route('/', adminBot)
admin.route('/', adminWebhook)

export default admin
