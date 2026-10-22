import type { Bindings } from '@api/types/bindings'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import { z } from 'zod'

const RelatedEventSchema = z.object({ eventId: z.uuid(), title: z.string().nonempty(), sourceUrl: z.url() })
export type WebhookRelatedEvent = z.infer<typeof RelatedEventSchema>
const PostIdSchema = z.string().regex(/^\d{1,20}$/)

/** 元告知への明示参照だけを使い、店舗や題の類似から連携先を確定しない。 */
export const webhookReferencedPostIds = (post: DetectPost): string[] => {
  const text = [post.text, ...(post.extractionContext === undefined ? [] : [post.extractionContext.originalText])].join(
    '\n'
  )
  return [
    ...new Set(
      [
        ...(post.quoted === undefined ? [] : [post.quoted.id]),
        ...(post.replyTo === undefined ? [] : [post.replyTo.id]),
        ...(post.extractionContext?.quotedId === undefined ? [] : [post.extractionContext.quotedId]),
        ...[
          ...text.matchAll(/https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[A-Za-z0-9_]+\/status\/(\d{1,20})(?=[/?#\s]|$)/g)
        ].flatMap((match) => (match[1] === undefined ? [] : [match[1]]))
      ].filter((id) => id !== post.id && PostIdSchema.safeParse(id).success)
    )
  ].slice(0, 10)
}

const sourcePostId = (url: string): string | null => {
  try {
    const parsed = new URL(url)
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      !['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(parsed.hostname)
    )
      return null
    const id = parsed.pathname.match(/^\/[A-Za-z0-9_]+\/status\/(\d{1,20})\/?$/)?.[1]
    return id === undefined ? null : id
  } catch {
    return null
  }
}

/** 関連先は確認用の提案であり、イベント本体・参考URL・受信状態を更新しない。 */
export const relatedWebhookEvents = async (
  env: Pick<Bindings, 'DB'>,
  post: DetectPost
): Promise<WebhookRelatedEvent[]> => {
  const ids = webhookReferencedPostIds(post)
  if (ids.length === 0) return []
  const rows = await env.DB.prepare(
    `SELECT e.id AS eventId,e.title,r.url AS sourceUrl FROM events e
      JOIN event_reference_urls r ON r.event_id=e.id
      WHERE ${ids.map(() => 'r.url LIKE ?').join(' OR ')} ORDER BY e.start_date DESC,e.id LIMIT 50`
  )
    .bind(...ids.map((id) => `%/status/${id}%`))
    .all()
  const verified = rows.results.flatMap((row) => {
    const parsed = RelatedEventSchema.safeParse(row)
    if (!parsed.success) return []
    const id = sourcePostId(parsed.data.sourceUrl)
    return id !== null && ids.includes(id) ? [parsed.data] : []
  })
  return [...new Map(verified.map((event) => [event.eventId, event])).values()].slice(0, 10)
}
