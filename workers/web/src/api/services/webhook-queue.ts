import { exhaustSocialJob, processSocialJob } from '@api/services/social-posting'
import { webhookProcessingErrorCode } from '@api/services/webhook-extraction'
import type { Bindings } from '@api/types/bindings'
import { WebhookQueueMessageSchema } from '@biccame/shared/schemas/webhook.dto'
import { SocialQueueMessageSchema } from '@biccame/shared/social'
import dayjs from 'dayjs'
import { processWebhookJob } from './webhook-job-process'

export const handleWebhookQueue = async (batch: MessageBatch<unknown>, env: Bindings) => {
  for (const message of batch.messages) {
    const social = SocialQueueMessageSchema.safeParse(message.body)
    if (social.success) {
      try {
        if (batch.queue.endsWith('-dlq')) {
          await exhaustSocialJob(env, social.data.jobId)
          message.ack()
          continue
        }
        const delay = await processSocialJob(env, social.data.jobId)
        if (delay === null) message.ack()
        else message.retry({ delaySeconds: delay })
      } catch {
        console.error('[social-queue] processing failed')
        message.retry({ delaySeconds: 60 })
      }
      continue
    }

    const parsed = WebhookQueueMessageSchema.safeParse(message.body)
    if (!parsed.success) {
      message.ack()
      continue
    }
    try {
      if (batch.queue.endsWith('-dlq')) {
        await env.DB.batch(
          ['webhook_event_candidates', 'webhook_event_jobs'].map((table) =>
            env.DB.prepare(`UPDATE ${table} SET status=CASE WHEN status IN ('queued','processing','failed') THEN 'failed' ELSE status END,
          notification_status=CASE WHEN status IN ('held','registered') AND notification_status='pending' THEN 'failed' ELSE notification_status END,
          last_error='retry_exhausted',lease_token=NULL,lease_until=NULL,updated_at=? WHERE post_id=?`).bind(
              dayjs().valueOf(),
              parsed.data.postId
            )
          )
        )
        message.ack()
        continue
      }
      const delay = await processWebhookJob(env, parsed.data.postId)
      if (delay === null) message.ack()
      else message.retry({ delaySeconds: Math.min(delay, 43200) })
    } catch (error) {
      console.error(`[webhook-queue] processing failed: ${webhookProcessingErrorCode(error)}`)
      message.retry({ delaySeconds: Math.min(30 * 2 ** Math.min(message.attempts, 6), 1800) })
    }
  }
}
