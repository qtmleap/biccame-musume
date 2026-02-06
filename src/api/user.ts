import { Hono } from 'hono'
import { z } from 'zod'
import { deleteUser, getUserById, upsertUser } from '@/services/user.service'
import type { Bindings, Variables } from '@/types/bindings'

const routes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

/**
 * ユーザー作成/更新リクエストスキーマ
 */
const UpsertUserRequestSchema = z.object({
  id: z.string(),
  displayName: z.string().nullable().optional(),
  photoUrl: z.string().nullable().optional(),
  twitterUsername: z.string().nullable().optional(),
  email: z.string().nullable().optional()
})

/**
 * ユーザー取得
 * GET /api/users/:id
 */
routes.get('/:id', async (c) => {
  const id = c.req.param('id')
  const user = await getUserById(c.env, id)

  if (!user) {
    return c.json({ error: 'User not found' }, 404)
  }

  return c.json({
    ...user,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString()
  })
})

/**
 * ユーザー作成/更新
 * POST /api/users
 */
routes.post('/', async (c) => {
  const body = await c.req.json()
  const parseResult = UpsertUserRequestSchema.safeParse(body)

  if (!parseResult.success) {
    return c.json({ error: 'Invalid request', details: parseResult.error.issues }, 400)
  }

  const user = await upsertUser(c.env, parseResult.data)

  return c.json({
    ...user,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString()
  })
})

/**
 * ユーザー削除
 * DELETE /api/users/:id
 */
routes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const user = await deleteUser(c.env, id)

  if (!user) {
    return c.json({ error: 'User not found' }, 404)
  }

  return c.json({ success: true })
})

export default routes
