import { getPrisma } from '@/lib/prisma'
import type { Bindings } from '@/types/bindings'

type User = {
  id: string
  displayName: string | null
  thumbnailURL: string | null
  screenName: string | null
  email: string | null
  createdAt: Date
  updatedAt: Date
}

/**
 * ユーザーIDでユーザーを取得
 * @param env - Cloudflare Workers Bindings
 * @param id - Firebase Auth UID
 * @returns ユーザー情報、存在しない場合はnull
 */
export const getUserById = async (env: Bindings, id: string): Promise<User | null> => {
  const prisma = getPrisma(env)

  const user = await prisma.user.findUnique({
    where: { id }
  })

  return user
}

/**
 * ユーザーを削除
 * @param env - Cloudflare Workers Bindings
 * @param id - Firebase Auth UID
 * @returns 削除されたユーザー、存在しない場合はnull
 */
export const deleteUser = async (env: Bindings, id: string): Promise<User | null> => {
  const prisma = getPrisma(env)

  try {
    const user = await prisma.user.delete({
      where: { id }
    })
    return user
  } catch {
    return null
  }
}
