import { OpenAPIHono } from '@hono/zod-openapi'
import { CFAuth } from '@/middleware/cloudflare-access'
import type { Bindings } from '@/types/bindings'
import adminBadges from '../admin-badge'
import adminComments from '../admin-comment'
import adminEventGroups from '../admin-event-group'
import adminTwitter from '../admin-twitter'
import adminUsers from '../admin-user'

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
admin.route('/', adminEventGroups)
admin.route('/', adminUsers)
admin.route('/', adminTwitter)

export default admin
