import aggregates from '@api/routes/admin-badge/aggregates'
import crud from '@api/routes/admin-badge/crud'
import type { Bindings } from '@api/types/bindings'
import { OpenAPIHono } from '@hono/zod-openapi'

const routes = new OpenAPIHono<{ Bindings: Bindings }>()

// Hono はルートの登録順が意味を持つため、crud (一覧/作成/更新/削除) → aggregates (leaderboard/holders/recalculate) の順を保つ
routes.route('/', crud)
routes.route('/', aggregates)

export default routes
