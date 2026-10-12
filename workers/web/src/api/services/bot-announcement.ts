import { saveSocialSnapshot } from '@api/services/social-posting'
import type { Bindings } from '@api/types/bindings'
import { socialEventView } from '@biccame/shared/domain/social-post'
import { buildEventCreatedText, buildEventUpdatedText, getQuoteTweetId } from '@biccame/shared/domain/tweet-text'
import type { EventDetail } from '@biccame/shared/schemas/event.dto'
import type { SocialSnapshot } from '@biccame/shared/social'

export const eventSocialSnapshot = (event: EventDetail, purpose: 'created' | 'updated'): SocialSnapshot => {
  return {
    kind: purpose,
    key: `${purpose}:${event.uuid}:${purpose === 'created' ? 'initial' : event.updatedAt.toISOString()}`,
    scheduledAt: event.updatedAt.toISOString(),
    images: [{ type: 'event', event: socialEventView(event) }],
    text:
      purpose === 'created'
        ? buildEventCreatedText({ ...event, title: event.title.slice(0, 40) })
        : buildEventUpdatedText({ ...event, title: event.title.slice(0, 40) }),
    quoteTweetId: getQuoteTweetId(event.referenceUrls, purpose === 'created' ? 'create' : 'update')
  }
}

/** 保存済みの公開イベントのみ、不変スナップショットを両チャネルへ予約する。 */
export const announceSavedEvent = async (
  env: Bindings,
  event: EventDetail,
  purpose: 'created' | 'updated'
): Promise<void> => {
  if (!event.isVerified) return
  await saveSocialSnapshot(env, eventSocialSnapshot(event, purpose))
}
