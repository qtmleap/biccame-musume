import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { HTTPException } from 'hono/http-exception'
import { getEvent } from '@/services/event-service'
import type { Bindings, Variables } from '@/types/bindings'
import { renderEventOgImage } from '@/utils/og-event-image'
import { eventOgPlace } from '@/utils/og-event-place'

const routes = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>()

const cacheKey = (id: string): string => `og:event:${id}`

// 画像のデザインを変えたら上げる。イベントが更新されていなくても、古いデザインのキャッシュを作り直す
const RENDER_VERSION = 2

type CachedMeta = { updatedAt: string; version?: number }

const isFresh = (meta: CachedMeta | null, updatedAt: Date): boolean =>
  meta?.updatedAt === updatedAt.toISOString() && meta.version === RENDER_VERSION

/**
 * GET /og/events/{id}.png
 *
 * Event ページの OG 画像をランタイムで生成する。 KV (BICCAME_MUSUME_EVENTS) に
 * key = `og:event:{id}` で PNG を保存し、 metadata に updatedAt と描画バージョンを記録する。
 * event.updatedAt か RENDER_VERSION が変わるとキャッシュ stale 扱いで再生成。
 */
routes.openapi(
  createRoute({
    method: 'get',
    path: '/events/:id',
    request: {
      params: z.object({
        // `:id.png` と書くとドットまでがパラメータ名になり param('id') が取れないため、拡張子込みで受ける
        id: z.string().nonempty()
      })
    },
    responses: {
      200: {
        content: {
          'image/png': {
            schema: z.string().openapi({ format: 'binary' })
          }
        },
        description: 'OG 画像取得成功'
      },
      404: {
        content: {
          'application/json': {
            schema: z.object({
              error: z.string().nonempty()
            })
          }
        },
        description: 'イベントが存在しない'
      }
    },
    tags: ['og']
  }),
  async (c) => {
    const id = c.req.valid('param').id.replace(/\.png$/, '')
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
        place: eventOgPlace(event)
      })
      await kv.put(cacheKey(id), fresh, {
        metadata: { updatedAt: event.updatedAt.toISOString(), version: RENDER_VERSION } satisfies CachedMeta,
        expirationTtl: 60 * 60 * 24 * 30
      })
      return fresh
    })()

    return c.body(png, 200, {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=0, s-maxage=86400, must-revalidate'
    })
  }
)

export default routes
