import { makeApi } from '@zodios/core'
import { z } from 'zod'
import { CreateCommentRequestSchema, ListCommentsResponseSchema } from '@/schemas/comment.dto'

export const commentsEndpoints = makeApi([
  {
    method: 'get',
    path: '/api/events/:uuid/comments',
    alias: 'getEventComments',
    description: 'イベントのコメント一覧を取得',
    response: ListCommentsResponseSchema
  },
  {
    method: 'post',
    path: '/api/events/:uuid/comments',
    alias: 'createEventComment',
    description: 'イベントにコメントを投稿',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: CreateCommentRequestSchema
      }
    ],
    response: z.object({ id: z.string() })
  },
  {
    method: 'delete',
    path: '/api/events/:uuid/comments/:commentId',
    alias: 'deleteEventComment',
    description: 'イベントのコメントを削除（管理者）',
    parameters: [
      {
        name: 'uuid',
        type: 'Path',
        schema: z.string().nonempty()
      },
      {
        name: 'commentId',
        type: 'Path',
        schema: z.string().nonempty()
      }
    ],
    response: z.object({ message: z.string() })
  }
])
