import { rejudgeWebhookJob, resolveWebhookJob, retryWebhookJob } from '@api/services/webhook-admin'
import { getWebhookJob, listWebhookJobs } from '@api/services/webhook-jobs'
import { getWebhookPrompt } from '@api/services/webhook-prompt'
import type { Bindings } from '@api/types/bindings'
import {
  WebhookJobListSchema,
  WebhookJobQuerySchema,
  WebhookJobSchema,
  WebhookPromptSchema,
  WebhookResolveSchema,
  WebhookRetrySchema
} from '@biccame/shared/schemas/webhook.dto'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'

const routes = new OpenAPIHono<{ Bindings: Bindings }>()
const params = z.object({ postId: z.string().regex(/^\d{1,20}$/) })
const jobResponse = {
  200: { description: 'Webhook処理履歴', content: { 'application/json': { schema: WebhookJobSchema } } }
}
routes.use('/admin/webhook/*', async (c, next) => {
  c.header('Cache-Control', 'no-store')
  await next()
})
routes.openapi(
  createRoute({
    method: 'get',
    path: '/admin/webhook/jobs',
    request: { query: WebhookJobQuerySchema },
    responses: {
      200: { description: 'ページ分割した受信履歴', content: { 'application/json': { schema: WebhookJobListSchema } } }
    },
    tags: ['admin-webhook']
  }),
  async (c) => c.json(await listWebhookJobs(c.env, c.req.valid('query')), 200)
)
routes.openapi(
  createRoute({
    method: 'get',
    path: '/admin/webhook/jobs/{postId}',
    request: { params },
    responses: jobResponse,
    tags: ['admin-webhook']
  }),
  async (c) => c.json(await getWebhookJob(c.env, c.req.valid('param').postId), 200)
)
routes.openapi(
  createRoute({
    method: 'post',
    path: '/admin/webhook/jobs/{postId}/retry',
    request: { params, body: { required: true, content: { 'application/json': { schema: WebhookRetrySchema } } } },
    responses: jobResponse,
    tags: ['admin-webhook']
  }),
  async (c) => c.json(await retryWebhookJob(c.env, c.req.valid('param').postId, c.req.valid('json')), 200)
)
routes.openapi(
  createRoute({
    method: 'post',
    path: '/admin/webhook/jobs/{postId}/rejudge',
    request: { params, query: z.object({ candidateId: z.uuid().optional() }) },
    responses: jobResponse,
    tags: ['admin-webhook']
  }),
  async (c) =>
    c.json(await rejudgeWebhookJob(c.env, c.req.valid('param').postId, c.req.valid('query').candidateId), 200)
)
routes.openapi(
  createRoute({
    method: 'post',
    path: '/admin/webhook/jobs/{postId}/resolve',
    request: { params, body: { required: true, content: { 'application/json': { schema: WebhookResolveSchema } } } },
    responses: jobResponse,
    tags: ['admin-webhook']
  }),
  async (c) => c.json(await resolveWebhookJob(c.env, c.req.valid('param').postId, c.req.valid('json')), 200)
)
routes.openapi(
  createRoute({
    method: 'get',
    path: '/admin/webhook/jobs/{postId}/prompt',
    request: { params, query: z.object({ candidateId: z.uuid().optional() }) },
    responses: {
      200: { description: '保存されたClef送信入力', content: { 'application/json': { schema: WebhookPromptSchema } } }
    },
    tags: ['admin-webhook']
  }),
  async (c) => c.json(await getWebhookPrompt(c.env, c.req.valid('param').postId, c.req.valid('query').candidateId), 200)
)
export default routes
