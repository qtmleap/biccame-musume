import { ClefRequestSchema, ClefResponseSchema } from '@biccame/shared/event-detect/clef'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import type { Bindings } from '@/types/bindings'

const routes = new OpenAPIHono<{ Bindings: Bindings }>()

// POST /api/admin/event-detect/decide — Workers AI の判定モデル Clef に 1 件の投稿を判定させる
// 認証は src/api/admin/index.ts で `/admin/*` 全体に CFAuth を適用
// 質問はスクリプト（scripts/event-detect.ts）や管理画面が組み立て、ここは中継と検証だけを行う。
routes.openapi(
  createRoute({
    method: 'post',
    path: '/admin/event-detect/decide',
    request: {
      body: { content: { 'application/json': { schema: ClefRequestSchema } } }
    },
    responses: {
      200: {
        content: { 'application/json': { schema: ClefResponseSchema } },
        description: '判定結果'
      },
      502: {
        content: { 'application/json': { schema: z.object({ error: z.string().nonempty() }) } },
        description: 'Workers AI の呼び出しまたは応答の検証に失敗'
      }
    },
    tags: ['admin-event-detect']
  }),
  async (c) => {
    const body = c.req.valid('json')
    c.header('Cache-Control', 'no-store')
    try {
      // workers-types に Clef の型がまだ無いため、応答は ClefResponseSchema で検証する
      const raw: unknown = await c.env.AI.run(`@cf/cloudflare/${body.model}`, body)
      const parsed = ClefResponseSchema.safeParse(raw)
      if (!parsed.success) {
        console.error('[admin-event-detect] unexpected Clef response:', JSON.stringify(raw).slice(0, 500))
        return c.json({ error: `unexpected response: ${parsed.error.message}` }, 502)
      }
      return c.json(parsed.data, 200)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[admin-event-detect] Clef call failed:', message)
      return c.json({ error: message }, 502)
    }
  }
)

export default routes
