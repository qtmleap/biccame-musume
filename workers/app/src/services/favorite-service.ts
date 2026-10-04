import { getPrisma } from '@/lib/prisma'
import type { Bindings } from '@/types/bindings'

/**
 * ユーザーのお気に入りキャラクターID一覧を取得
 */
export const listFavoriteCharacters = async (env: Bindings, userId: string): Promise<string[]> => {
  const prisma = getPrisma(env)
  const rows = await prisma.favoriteCharacter.findMany({
    where: { userId },
    select: { characterId: true },
    orderBy: { createdAt: 'asc' }
  })
  return rows.map((r) => r.characterId)
}

/**
 * お気に入りキャラクターを追加（既存ならノーオペ）
 */
export const addFavoriteCharacter = async (env: Bindings, userId: string, characterId: string): Promise<void> => {
  const prisma = getPrisma(env)
  await prisma.favoriteCharacter.upsert({
    where: { userId_characterId: { userId, characterId } },
    update: {},
    create: { userId, characterId }
  })
}

/**
 * お気に入りキャラクターを削除
 */
export const removeFavoriteCharacter = async (env: Bindings, userId: string, characterId: string): Promise<void> => {
  const prisma = getPrisma(env)
  await prisma.favoriteCharacter.deleteMany({
    where: { userId, characterId }
  })
}
