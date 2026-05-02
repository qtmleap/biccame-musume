import type { PrismaClient } from '@prisma/client'
import type { CommentResponse } from '@/schemas/comment.dto'

const toResponse = (comment: { id: string; nickname: string; body: string; createdAt: Date }): CommentResponse => ({
  id: comment.id,
  nickname: comment.nickname,
  body: comment.body,
  createdAt: comment.createdAt.toISOString()
})

/**
 * イベントに紐づく公開コメント一覧を返す（論理削除除外、新しい順）
 */
export const listComments = async (prisma: PrismaClient, eventId: string): Promise<CommentResponse[]> => {
  const rows = await prisma.eventComment.findMany({
    where: { eventId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, nickname: true, body: true, createdAt: true }
  })
  return rows.map(toResponse)
}

/**
 * コメントを作成して返す
 */
export const createComment = async (
  prisma: PrismaClient,
  eventId: string,
  data: { nickname: string; body: string; ipAddress: string }
): Promise<CommentResponse> => {
  const comment = await prisma.eventComment.create({
    data: {
      eventId,
      nickname: data.nickname,
      body: data.body,
      ipAddress: data.ipAddress
    },
    select: { id: true, nickname: true, body: true, createdAt: true }
  })
  return toResponse(comment)
}
