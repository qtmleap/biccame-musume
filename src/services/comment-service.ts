import type { PrismaClient } from '@prisma/client'
import type { CommentResponse } from '@/schemas/comment.dto'

// nickname カラムには選択された characterId を保存している（マイグレーション回避のためカラム再利用）
const toResponse = (comment: {
  id: string
  nickname: string
  body: string
  createdAt: Date
  adminEmail: string | null
}): CommentResponse => ({
  id: comment.id,
  characterId: comment.nickname,
  body: comment.body,
  createdAt: comment.createdAt.toISOString(),
  adminEmail: comment.adminEmail ?? undefined
})

/**
 * イベントに紐づく公開コメント一覧を返す（論理削除除外、新しい順）
 */
export const listComments = async (prisma: PrismaClient, eventId: string): Promise<CommentResponse[]> => {
  const rows = await prisma.eventComment.findMany({
    where: { eventId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, nickname: true, body: true, createdAt: true, adminEmail: true }
  })
  return rows.map(toResponse)
}

/**
 * コメントを作成して返す
 */
export const createComment = async (
  prisma: PrismaClient,
  eventId: string,
  data: { characterId: string; body: string; ipAddress: string; adminEmail?: string }
): Promise<CommentResponse> => {
  const comment = await prisma.eventComment.create({
    data: {
      eventId,
      nickname: data.characterId,
      body: data.body,
      ipAddress: data.ipAddress,
      adminEmail: data.adminEmail ?? null
    },
    select: { id: true, nickname: true, body: true, createdAt: true, adminEmail: true }
  })
  return toResponse(comment)
}

/**
 * コメントを論理削除する。対象が存在しない場合は false を返す。
 */
export const deleteComment = async (prisma: PrismaClient, commentId: string): Promise<boolean> => {
  const existing = await prisma.eventComment.findUnique({
    where: { id: commentId },
    select: { id: true, deletedAt: true }
  })
  if (existing === null || existing.deletedAt !== null) {
    return false
  }
  await prisma.eventComment.update({
    where: { id: commentId },
    data: { deletedAt: new Date() }
  })
  return true
}
