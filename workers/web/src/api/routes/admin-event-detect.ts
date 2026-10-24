import type { Bindings } from '@api/types/bindings'
import { ClefRequestSchema, ClefResponseSchema } from '@biccame/shared/event-detect/clef'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'

const routes = new OpenAPIHono<{ Bindings: Bindings }>()
const DiagnosticSchema = z.object({
  requestId: z.uuid(),
  model: z.enum(['clef', 'clef-flash']),
  questionCount: z.number().int().positive(),
  phase: z.enum(['start', 'end', 'error']),
  elapsedMs: z.number().int().nonnegative(),
  internalReference: z
    .string()
    .regex(/^[a-z0-9]{8,64}$/i)
    .optional()
})
const ErrorSchema = z.object({
  error: z.enum(['clef_call_failed', 'clef_invalid_response']),
  diagnostic: DiagnosticSchema
})

// runtime の参照 ID 以外の例外本文・stack・接続先をログや応答へ出さない。
const internalReference = (error: unknown) =>
  error instanceof Error
    ? /\binternal error; reference = ([a-z0-9]{8,64})(?=$|[\s;,.])/i.exec(error.message)?.[1]
    : undefined

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
        content: { 'application/json': { schema: ErrorSchema } },
        description: 'Workers AI の呼び出しまたは応答の検証に失敗'
      }
    },
    tags: ['admin-event-detect']
  }),
  async (c) => {
    const body = c.req.valid('json')
    c.header('Cache-Control', 'no-store')
    const suppliedRequestId = z.uuid().safeParse(c.req.header('X-Event-Detect-Request-Id'))
    const requestId = suppliedRequestId.success ? suppliedRequestId.data : crypto.randomUUID()
    const startedAt = performance.now()
    const context = { requestId, model: body.model, questionCount: Object.keys(body.questions).length }
    const diagnostic = (phase: 'start' | 'end' | 'error') => ({
      ...context,
      phase,
      elapsedMs: Math.round(performance.now() - startedAt)
    })
    c.header('X-Event-Detect-Request-Id', requestId)
    console.info('[admin-event-detect]', JSON.stringify(diagnostic('start')))
    try {
      // workers-types に Clef の型がまだ無いため、応答は ClefResponseSchema で検証する
      const raw: unknown = await c.env.AI.run(`@cf/cloudflare/${body.model}`, body)
      const parsed = ClefResponseSchema.safeParse(raw)
      if (!parsed.success) {
        const details = diagnostic('error')
        console.error('[admin-event-detect]', JSON.stringify({ ...details, error: 'clef_invalid_response' }))
        return c.json({ error: 'clef_invalid_response' as const, diagnostic: details }, 502)
      }
      console.info('[admin-event-detect]', JSON.stringify(diagnostic('end')))
      return c.json(parsed.data, 200)
    } catch (err) {
      const reference = internalReference(err)
      const details = { ...diagnostic('error'), ...(reference ? { internalReference: reference } : {}) }
      console.error('[admin-event-detect]', JSON.stringify({ ...details, error: 'clef_call_failed' }))
      return c.json({ error: 'clef_call_failed' as const, diagnostic: details }, 502)
    }
  }
)

export default routes
