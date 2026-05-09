import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { getEvent } from '@/services/event-service'
import type { Bindings, Variables } from '@/types/bindings'
import { renderEventOgImage } from '@/utils/og-event-image'

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

const cacheKey = (id: string): string => `og:event:${id}`

type CachedMeta = { updatedAt: string }

const isFresh = (meta: CachedMeta | null, updatedAt: Date): boolean => meta?.updatedAt === updatedAt.toISOString()

/**
 * GET /og/events/:id.png
 *
 * Event ページの OG 画像をランタイムで生成する。 KV (BICCAME_MUSUME_EVENTS) に
 * key = `og:event:{id}` で PNG を保存し、 metadata に updatedAt を記録する。
 * event.updatedAt が変わるとキャッシュ stale 扱いで再生成。
 */
app.get('/events/:id.png', async (c) => {
  const id = c.req.param('id')
  if (!id) throw new HTTPException(400, { message: 'Missing id' })
  const event = await getEvent(c.env, id).catch(() => null)
  if (!event) throw new HTTPException(404, { message: 'Event not found' })

  const kv = c.env.BICCAME_MUSUME_EVENTS
  const cached = await kv.getWithMetadata<CachedMeta>(cacheKey(id), 'arrayBuffer')

  const png = await (async () => {
    if (cached.value && isFresh(cached.metadata, event.updatedAt)) {
      return new Uint8Array(cached.value)
    }
    const fresh = await renderEventOgImage(c.env, new URL(c.req.url).origin, {
      title: event.title,
      startDate: event.startDate,
      endDate: event.endDate ?? null,
      limitedQuantity: event.limitedQuantity ?? null,
      storeCount: event.stores.length
    })
    await kv.put(cacheKey(id), fresh, {
      metadata: { updatedAt: event.updatedAt.toISOString() } satisfies CachedMeta,
      expirationTtl: 60 * 60 * 24 * 30
    })
    return fresh
  })()

  return new Response(png as BodyInit, {
    status: 200,
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=0, s-maxage=86400, must-revalidate'
    }
  })
})

export default app
