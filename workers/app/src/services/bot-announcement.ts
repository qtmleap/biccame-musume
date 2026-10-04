import { announcementSchema, deliveryResultSchema } from '@biccame/shared/bot'
import type { EventDetail } from '@/schemas/event.dto'
import type { Bindings } from '@/types/bindings'
import { buildEventCreatedText, buildEventUpdatedText, getQuoteTweetId } from '@/utils/tweet-text'
import { Twitter } from '@/utils/twitter'

// 移設の担当フラグで片方だけを実行する。bot失敗時にappから再送しない。
export const announceSavedEvent = async (
  env: Bindings,
  event: EventDetail,
  purpose: 'created' | 'updated'
): Promise<void> => {
  if (env.X_POSTING_OWNER !== 'bot') {
    const twitter = new Twitter(env)
    if (purpose === 'created') await twitter.tweetEventCreated(event)
    else await twitter.tweetEventUpdated(event)
    return
  }
  if (!env.BOT) throw new Error('Event announcement failed: bot binding unavailable')
  const parsed = announcementSchema.safeParse({
    eventUUID: event.uuid,
    revision: event.updatedAt.toISOString(),
    purpose,
    text: purpose === 'created' ? buildEventCreatedText(event) : buildEventUpdatedText(event),
    quoteTweetId: getQuoteTweetId(event.referenceUrls, purpose === 'created' ? 'create' : 'update')
  })
  if (!parsed.success) throw new Error('Event announcement failed: invalid contract')
  let result: unknown
  try {
    result = await env.BOT.announce(parsed.data)
  } catch {
    throw new Error('Event announcement outcome unknown: RPC failure')
  }
  const response = deliveryResultSchema.safeParse(result)
  if (!response.success) throw new Error('Event announcement outcome unknown: invalid RPC response')
  if (response.data.status !== 'sent') throw new Error(`Event announcement not sent: ${response.data.status}`)
}
