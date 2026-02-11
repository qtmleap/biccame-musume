import { getFirebaseToken } from '@hono/firebase-auth'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import type { User } from '@prisma/client'
import { csrf } from 'hono/csrf'
import { HTTPException } from 'hono/http-exception'
import { ErrorResponseSchema } from '@/schemas/activity.dto'
import { UpsertUserRequestSchema, UserResponseSchema } from '@/schemas/user.dto'
import { getUserById } from '@/services/user.service'
import type { Bindings, Variables } from '@/types/bindings'
import { getJwtPayload, verifyToken } from '@/utils/token'

const routes = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>({
  defaultHook: (result) => {
    if (!result.success) {
      throw result.error
    }
  }
})

routes.use('*', csrf())

/**
 * 自分のユーザー情報取得
 * GET /api/me
 */
routes.openapi(
  createRoute({
    method: 'get',
    path: '/',
    middlewares: [verifyToken],
    responses: {
      200: {
        content: {
          'application/json': {
            schema: UserResponseSchema
          }
        },
        description: 'ユーザー取得成功'
      },
      401: {
        content: {
          'application/json': {
            schema: ErrorResponseSchema
          }
        },
        description: '認証エラー'
      },
      404: {
        content: {
          'application/json': {
            schema: ErrorResponseSchema
          }
        },
        description: 'ユーザーが見つかりません'
      }
    },
    tags: ['users']
  }),
  async (c) => {
    // JWTペイロードから情報取得を試みる
    const jwtPayload = getJwtPayload(c)
    if (jwtPayload) {
      // クッキーにユーザー情報があればそれを返す（DBアクセス不要）
      return c.json(
        {
          id: jwtPayload.uid,
          displayName: jwtPayload.usr.display_name,
          thumbnailURL: jwtPayload.usr.thumbnail_url,
          screenName: null,
          email: jwtPayload.usr.email
        },
        200
      )
    }

    // クッキーがない場合はFirebaseトークンから取得
    const token = getFirebaseToken(c)
    if (token === null) {
      throw new HTTPException(401, { message: 'Unauthorized' })
    }
    const user: User | null = await getUserById(c.env, token.uid)

    if (user === null) {
      throw new HTTPException(404, { message: 'Not found' })
    }

    return c.json(user, 200)
  }
)

/**
 * 自分のユーザー情報作成/更新
 * POST /api/users
 */
routes.openapi(
  createRoute({
    method: 'post',
    path: '/',
    middlewares: [verifyToken],
    request: {
      body: {
        content: {
          'application/json': {
            schema: UpsertUserRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: UserResponseSchema
          }
        },
        description: 'ユーザー作成/更新成功'
      },
      400: {
        content: {
          'application/json': {
            schema: ErrorResponseSchema
          }
        },
        description: 'バリデーションエラー'
      },
      401: {
        content: {
          'application/json': {
            schema: ErrorResponseSchema
          }
        },
        description: '認証エラー'
      },
      403: {
        content: {
          'application/json': {
            schema: ErrorResponseSchema
          }
        },
        description: '権限エラー'
      }
    },
    tags: ['users']
  }),
  async (c) => {
    const token = getFirebaseToken(c)
    if (token === null) {
      throw new HTTPException(401, { message: 'Unauthorized' })
    }
    const user: User | null = await getUserById(c.env, token.uid)

    if (user === null) {
      throw new HTTPException(404, { message: 'Not Found' })
    }

    console.log(user)
    return c.json(user, 200)
    // return c.json(user, 200)
    // const user = await upsertUser(c.env, {
    //   id: token.uid,
    //   displayName: token.name || null,
    //   email: token.email || null,
    //   thumbnailURL: token.picture || null,
    //   screenName: body.screenName
    // })
    // return c.json(user, 200)
  }
)

// /**
//  * 自分のユーザー情報削除
//  * DELETE /api/users
//  */
// routes.openapi(
//   createRoute({
//     method: 'delete',
//     path: '/',
//     responses: {
//       200: {
//         content: {
//           'application/json': {
//             schema: SuccessResponseSchema
//           }
//         },
//         description: 'ユーザー削除成功'
//       },
//       401: {
//         content: {
//           'application/json': {
//             schema: ErrorResponseSchema
//           }
//         },
//         description: '認証エラー'
//       },
//       404: {
//         content: {
//           'application/json': {
//             schema: ErrorResponseSchema
//           }
//         },
//         description: 'ユーザーが見つかりません'
//       }
//     },
//     tags: ['users']
//   }),
//   async (c) => {
//     const token = getFirebaseToken(c)
//     if (token === null) {
//       throw new HTTPException(401, { message: 'Unauthorized' })
//     }
//     const user: User | null = await getUserById(c.env, token.uid)

//     if (user === null) {
//       throw new HTTPException(404, { message: 'Not found' })
//     }

//     return c.json(user, 200)
//   }
// )

export default routes
