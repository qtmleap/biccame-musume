import { renderSocialImage } from '@api/lib/social-image'
import { isSocialSnapshotPublic } from '@api/lib/social-public-snapshot'
import type { SocialImageRenderer } from '@api/services/social-posting'
import type { Bindings, Variables } from '@api/types/bindings'
import { SocialSnapshotSchema } from '@biccame/shared/social'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { HTTPException } from 'hono/http-exception'

// デザイン変更時に更新し、保存済み画像を再生成する。
const RENDER_VERSION = 2

/** 0 起点の画像番号。先頭ゼロ・符号・小数は受け付けず、拡張子 `.png` だけ付けてよい。 */
const IMAGE_INDEX_PATTERN = /^(0|[1-9]\d*)(?:\.png)?$/

const notFound = () => new HTTPException(404, { message: 'Image not found' })

export const createSocialOgRoutes = (render: SocialImageRenderer = renderSocialImage) => {
  const routes = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>()
  routes.openapi(
    createRoute({
      method: 'get',
      path: '/social/:id/:index',
      // 不正な番号は 404 にするため、形式の検査は zod のパラメータ検査（400）ではなくハンドラ内で行う。
      request: { params: z.object({ id: z.string().nonempty(), index: z.string().nonempty() }) },
      responses: {
        200: {
          content: { 'image/png': { schema: z.string().openapi({ format: 'binary' }) } },
          description: '固定投稿スナップショットのうち、index 番目（0 起点）の画像のOG画像'
        },
        404: { description: '公開投稿スナップショットまたは指定の画像が存在しない' }
      },
      tags: ['og']
    }),
    async (c) => {
      const params = c.req.valid('param')
      const parsedId = z.uuid().safeParse(params.id)
      const matchedIndex = IMAGE_INDEX_PATTERN.exec(params.index)
      if (!parsedId.success || matchedIndex === null) throw notFound()
      const index = Number(matchedIndex[1])
      const row = await c.env.DB.prepare('SELECT snapshot_json FROM social_post_jobs WHERE id = ?')
        .bind(parsedId.data)
        .first<{ snapshot_json: string }>()
      if (row === null) throw notFound()
      const raw: unknown = (() => {
        try {
          return JSON.parse(row.snapshot_json)
        } catch {
          throw notFound()
        }
      })()
      const snapshot = SocialSnapshotSchema.safeParse(raw)
      if (
        !snapshot.success ||
        index >= snapshot.data.images.length ||
        !(await isSocialSnapshotPublic(c.env, snapshot.data))
      ) {
        throw notFound()
      }
      // 公開状態の確認をキャッシュ取得より先に行い、固定内容のハッシュで別版との混同を防ぐ。
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(row.snapshot_json))
      const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
      const cacheKey = `og:social:v${RENDER_VERSION}:${parsedId.data}:${index}:${hash}`
      const kv = c.env.BICCAME_MUSUME_EVENTS
      const cached = await kv.get(cacheKey, 'arrayBuffer').catch(() => {
        console.error('[social-og] cache read failed')
        return null
      })
      const png = await (async () => {
        if (cached !== null) return new Uint8Array(cached)
        const fresh = await render(c.env, snapshot.data, index)
        await kv.put(cacheKey, fresh, { expirationTtl: 60 * 60 * 24 * 30 }).catch(() => {
          console.error('[social-og] cache write failed')
        })
        return fresh
      })()
      return c.body(png, 200, {
        'content-type': 'image/png',
        // 外部キャッシュから非公開化後の画像が再配信されないよう、毎回公開状態を確認する。
        'cache-control': 'no-store'
      })
    }
  )
  return routes
}

export default createSocialOgRoutes()
