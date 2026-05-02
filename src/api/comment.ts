import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { getPrisma } from '@/lib/prisma'
import { CommentResponseSchema, CreateCommentRequestSchema, ListCommentsResponseSchema } from '@/schemas/comment.dto'
import { createComment, listComments } from '@/services/comment-service'
import type { Bindings, Variables } from '@/types/bindings'
import { loadBiccameMusumeIdSet } from '@/utils/character-whitelist'
import { moderateText } from '@/utils/moderation'
import { containsNgWord } from '@/utils/ng-words'
import { sanitizeCommentBody } from '@/utils/sanitize'
import { verifyTurnstileToken } from '@/utils/turnstile'

const routes = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>()

/**
 * コメント一覧取得
 * GET /api/events/:uuid/comments
 */
routes.openapi(
  createRoute({
    method: 'get',
    path: '/:uuid/comments',
    request: {
      params: z.object({
        uuid: z.string().uuid()
      })
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: ListCommentsResponseSchema
          }
        },
        description: 'コメント一覧取得成功'
      }
    },
    tags: ['comments']
  }),
  async (c) => {
    const { uuid } = c.req.valid('param')
    const prisma = getPrisma(c.env)
    const comments = await listComments(prisma, uuid)
    return c.json(comments, 200)
  }
)

/**
 * コメント投稿
 * POST /api/events/:uuid/comments
 */
routes.openapi(
  createRoute({
    method: 'post',
    path: '/:uuid/comments',
    request: {
      params: z.object({
        uuid: z.string().uuid()
      }),
      body: {
        content: {
          'application/json': {
            schema: CreateCommentRequestSchema
          }
        }
      }
    },
    responses: {
      201: {
        content: {
          'application/json': {
            schema: CommentResponseSchema
          }
        },
        description: 'コメント投稿成功'
      },
      400: {
        content: {
          'application/json': {
            schema: z.object({ message: z.string() })
          }
        },
        description: 'バリデーションエラーまたはモデレーションNG'
      },
      404: {
        content: {
          'application/json': {
            schema: z.object({ message: z.string() })
          }
        },
        description: 'イベントが見つかりません'
      },
      429: {
        content: {
          'application/json': {
            schema: z.object({ message: z.string() })
          }
        },
        description: 'レート制限エラー'
      }
    },
    tags: ['comments']
  }),
  async (c) => {
    const { uuid } = c.req.valid('param')
    const { characterId, body, turnstileToken } = c.req.valid('json')

    const ip = c.req.header('cf-connecting-ip') ?? '127.0.0.1'

    // 1. レート制限
    const { success: rateLimitOk } = await c.env.COMMENT_RATE_LIMITER.limit({ key: ip })
    if (!rateLimitOk) {
      return c.json({ message: '送信が多すぎます。しばらくしてからお試しください' }, 429)
    }

    // 2. Turnstile 検証
    const turnstileOk = await verifyTurnstileToken(turnstileToken, c.env.TURNSTILE_SECRET_KEY, ip, c.env)
    if (!turnstileOk) {
      return c.json({ message: 'Turnstile 検証に失敗しました' }, 400)
    }

    // 3. characterId をホワイトリスト検証 (改ざんされたフォーム対策)
    const validIds = await loadBiccameMusumeIdSet(c.env.ASSETS, c.req.url)
    if (!validIds.has(characterId)) {
      return c.json({ message: '無効なキャラクター ID です' }, 400)
    }

    // 4. 本文を制御文字 / RTL override / zero-width で正規化
    const sanitizedBody = sanitizeCommentBody(body)
    if (sanitizedBody.length === 0) {
      return c.json({ message: 'コメントは必須です' }, 400)
    }

    // 5. 静的 NG ワードリストで安価に弾く (Llama Guard より前)
    if (containsNgWord(sanitizedBody)) {
      return c.json({ message: '不適切な内容と判定されました' }, 400)
    }

    // 6. モデレーション (sanitize 済みのテキストで判定)
    const { safe } = await moderateText(sanitizedBody, c.env.AI, c.env)
    if (!safe) {
      return c.json({ message: '不適切な内容と判定されました' }, 400)
    }

    // 7. イベント存在確認
    const prisma = getPrisma(c.env)
    const event = await prisma.event.findUnique({ where: { id: uuid }, select: { id: true } })
    if (event === null) {
      return c.json({ message: 'Not Found' }, 404)
    }

    // 8. コメント作成
    const comment = await createComment(prisma, uuid, { characterId, body: sanitizedBody, ipAddress: ip })
    return c.json(comment, 201)
  }
)

export default routes
