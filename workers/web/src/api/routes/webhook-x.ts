import { enqueueWebhookJob, insertWebhookJob } from '@api/services/webhook-jobs'
import { readWebhookBody, verifyWebhookSignature } from '@api/services/webhook-signature'
import type { Bindings } from '@api/types/bindings'
import { buildRescueTerms, classifyPost } from '@biccame/shared/event-detect/filter'
import { normalizeWebhookPayload } from '@biccame/shared/event-detect/webhook'
import { botStores } from '@biccame/shared/stores'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'

const routes = new Hono<{ Bindings: Bindings }>()
const storeAccounts = new Set(botStores.map((store) => store.twitter_id.toLowerCase()))
const rescueTerms = buildRescueTerms(botStores.map((store) => store.name))

routes.post('/', async (c) => {
  c.header('Cache-Control', 'no-store')
  const secret = c.env.WEBHOOK_SECRET_KEY
  if (!secret?.trim()) return c.json({ message: 'Webhook unavailable' }, 503)
  if (c.req.header('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return c.json({ message: 'Expected application/json' }, 400)
  }
  try {
    const body = await readWebhookBody(c.req.raw)
    if (body === null) return c.json({ message: 'Payload too large' }, 413)
    const signature = c.req.header('Webhook-Signature')
    if (!(await verifyWebhookSignature(body, signature === undefined ? null : signature, secret))) {
      return c.json({ message: 'Invalid webhook signature' }, 401)
    }
    const parsed = (() => {
      try {
        const raw: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body))
        return normalizeWebhookPayload(raw)
      } catch {
        return { success: false as const }
      }
    })()
    if (!parsed.success) return c.json({ message: 'Invalid webhook payload' }, 400)
    const post = parsed.data
    const verdict = classifyPost(post, { storeAccounts, rescueTerms })
    const job = await insertWebhookJob(c.env, post, verdict.reason)
    if (job.status === 'ignored' || job.status === 'held' || job.status === 'registered') {
      return c.json({ status: job.status, postId: job.postId }, 200)
    }
    await enqueueWebhookJob(c.env, job.postId)
    return c.json({ status: 'queued', postId: job.postId }, 202)
  } catch (error) {
    if (error instanceof HTTPException && error.status === 400) return c.json({ message: error.message }, 400)
    console.error('[webhook-x] failed to accept delivery')
    return c.json({ message: 'Webhook temporarily unavailable' }, 503)
  }
})
export default routes
