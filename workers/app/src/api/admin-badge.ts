import { OpenAPIHono } from '@hono/zod-openapi'
import type { Bindings } from '@/types/bindings'
import aggregates from './admin-badge/aggregates'
import crud from './admin-badge/crud'

const routes = new OpenAPIHono<{ Bindings: Bindings }>()

// Hono はルートの登録順が意味を持つため、crud (一覧/作成/更新/削除) → aggregates (leaderboard/holders/recalculate) の順を保つ
routes.route('/', crud)
routes.route('/', aggregates)

export default routes
