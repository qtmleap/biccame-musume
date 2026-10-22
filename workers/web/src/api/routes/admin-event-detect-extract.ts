import type { Bindings } from '@api/types/bindings'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { bodyLimit } from 'hono/body-limit'
import { createMiddleware } from 'hono/factory'

// 抽出モデルは実アプリ（services/webhook-extraction.ts）と同じ値に固定し、クライアントからは変えられない。
const EXTRACT_EVALUATE_MODEL = 'claude-haiku-5-5'
const EXTRACT_EVALUATE_PATH = '/admin/event-detect/extract-evaluate'
const MAX_REQUEST_BYTES = 100_000
const PROVIDER_TIMEOUT_MS = 30_000
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]'])

/** 実アプリの抽出リクエスト（model / max_tokens / system / messages / tools / tool_choice）と同じ形。未知のキーは受け付けない。 */
export const ExtractEvaluateRequestSchema = z.strictObject({
  model: z.literal(EXTRACT_EVALUATE_MODEL),
  max_tokens: z.number().int().positive().max(4096),
  system: z.string().nonempty().max(24_000),
  messages: z.array(z.strictObject({ role: z.literal('user'), content: z.string().nonempty().max(60_000) })).length(1),
  tools: z
    .array(
      z.strictObject({
        name: z.literal('answer'),
        description: z.string().nonempty().max(2000),
        input_schema: z.record(z.string().nonempty(), z.unknown())
      })
    )
    .length(1),
  tool_choice: z.union([
    z.strictObject({ type: z.literal('auto') }),
    z.strictObject({ type: z.literal('tool'), name: z.literal('answer') })
  ])
})

/** プロバイダ応答のうち、モデルの生 content だけを返す。stop_reason / usage などは返さない。 */
export const ExtractEvaluateResponseSchema = z.object({ content: z.array(z.unknown()) })

const ErrorSchema = z.object({ error: z.string().nonempty() })

type ExtractEvaluateFetcher = (url: string, init: RequestInit) => Promise<Response>

type ProviderEnv = Pick<Bindings, 'ANTHROPIC_BASE_URL' | 'ANTHROPIC_AUTH_TOKEN'>

/** 評価専用。ローカル開発環境かつループバック宛ての http リクエストだけを通す。 */
const isLocalEvaluationRequest = (url: string, environment: string | undefined) => {
  const target = new URL(url)
  return environment === 'local' && target.protocol === 'http:' && LOCAL_HOSTNAMES.has(target.hostname)
}

/**
 * POST /api/admin/event-detect/extract-evaluate — 抽出モデルへ 1 件の凍結入力を送り、生の content だけを返す。
 * 認証は src/api/routes/admin/index.ts で `/admin/*` 全体に CFAuth を適用する。
 * ローカル以外では 404、プロバイダ接続先・トークンは Worker の環境変数だけから読み、リトライ・DB・キュー・通知は一切行わない。
 */
export const createExtractEvaluateRoutes = (
  fetcher: ExtractEvaluateFetcher = (url, init) => fetch(url, init),
  timeoutMs: number = PROVIDER_TIMEOUT_MS
) => {
  const routes = new OpenAPIHono<{ Bindings: Bindings }>()
  // 環境・宛先の検査は本文の検査より前に行い、ローカル以外には本文の形すら見せない。
  routes.use(
    EXTRACT_EVALUATE_PATH,
    createMiddleware<{ Bindings: Bindings }>(async (c, next) => {
      if (!isLocalEvaluationRequest(c.req.url, c.env.ENVIRONMENT)) return c.json({ error: 'Not found' }, 404)
      c.header('Cache-Control', 'no-store')
      await next()
    }),
    bodyLimit({
      maxSize: MAX_REQUEST_BYTES,
      onError: (c) => c.json({ error: 'Extraction request too large' }, 413)
    })
  )
  routes.openapi(
    createRoute({
      method: 'post',
      path: EXTRACT_EVALUATE_PATH,
      // required を付けないと JSON 以外の Content-Type では本文の検証が省略されるため、必須にする。
      request: { body: { required: true, content: { 'application/json': { schema: ExtractEvaluateRequestSchema } } } },
      responses: {
        200: {
          content: { 'application/json': { schema: ExtractEvaluateResponseSchema } },
          description: '抽出モデルの生 content'
        },
        404: {
          content: { 'application/json': { schema: ErrorSchema } },
          description: 'ローカル開発環境以外では提供しない'
        },
        413: {
          content: { 'application/json': { schema: ErrorSchema } },
          description: 'リクエストが上限を超えている'
        },
        502: {
          content: { 'application/json': { schema: ErrorSchema } },
          description: '抽出プロバイダの未設定・通信失敗・不正な応答'
        }
      },
      tags: ['admin-event-detect']
    }),
    async (c) => {
      const env: ProviderEnv = c.env
      const baseUrl = env.ANTHROPIC_BASE_URL
      const token = env.ANTHROPIC_AUTH_TOKEN
      if (!baseUrl || !token) return c.json({ error: 'extraction_not_configured' }, 502)
      const signal = AbortSignal.timeout(timeoutMs)
      const response = await fetcher(`${baseUrl.replace(/\/+$/, '')}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          Authorization: `Bearer ${token}`,
          'x-api-key': token
        },
        body: JSON.stringify(c.req.valid('json')),
        signal
      }).catch((error: unknown) => {
        // 接続先・トークンを含み得る例外の本文は出さず、種別だけを残す。
        const timedOut =
          signal.aborted || (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))
        console.error(`[admin-event-detect-extract] provider request failed: ${timedOut ? 'timeout' : 'network'}`)
        return timedOut ? 'extraction_timeout' : 'extraction_network_error'
      })
      if (typeof response === 'string') return c.json({ error: response }, 502)
      if (!response.ok) {
        console.error(`[admin-event-detect-extract] provider returned HTTP ${response.status}`)
        return c.json({ error: `extraction_http_${response.status}` }, 502)
      }
      const raw: unknown = await response.json().catch(() => undefined)
      const parsed = ExtractEvaluateResponseSchema.safeParse(raw)
      if (!parsed.success) {
        console.error('[admin-event-detect-extract] provider returned an unexpected response shape')
        return c.json({ error: 'extraction_invalid_response' }, 502)
      }
      return c.json(parsed.data, 200)
    }
  )
  return routes
}

export default createExtractEvaluateRoutes()
