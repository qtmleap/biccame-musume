import { PrismaD1 } from '@prisma/adapter-d1'
import { PrismaClient } from '@prisma/client'
import type { Bindings } from '@/types/bindings'

type UserInput = {
  id: string
  displayName?: string | null
  thumbnailURL?: string | null
  screenName?: string | null
  email?: string | null
}

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
  const prisma = new PrismaClient({ adapter: new PrismaD1(env.DB) })

  const user = await prisma.user.findUnique({
    where: { id }
  })

  return user
}

/**
 * ユーザーを作成または更新（upsert）
 * ログイン時に呼び出してユーザー情報を保存/更新する
 * @param env - Cloudflare Workers Bindings
 * @param data - ユーザー情報
 * @returns 作成または更新されたユーザー
 */
export const upsertUser = async (env: Bindings, data: UserInput): Promise<User> => {
  const prisma = new PrismaClient({ adapter: new PrismaD1(env.DB) })

  const user = await prisma.user.upsert({
    where: { id: data.id },
    update: {
      displayName: data.displayName,
      thumbnailURL: data.thumbnailURL,
      screenName: data.screenName,
      email: data.email
    },
    create: {
      id: data.id,
      displayName: data.displayName,
      thumbnailURL: data.thumbnailURL,
      screenName: data.screenName,
      email: data.email
    }
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
  const prisma = new PrismaClient({ adapter: new PrismaD1(env.DB) })

  try {
    const user = await prisma.user.delete({
      where: { id }
    })
    return user
  } catch {
    return null
  }
}
