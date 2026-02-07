import { PrismaD1 } from '@prisma/adapter-d1'
import { PrismaClient } from '@prisma/client'
import type { Bindings } from '@/types/bindings'

/**
 * ユーザーの訪問済み店舗一覧を取得
 * @param env - Cloudflare Workers Bindings
 * @param userId - Firebase Auth UID
 * @returns 訪問済み店舗のstoreKeyリスト
 */
export const getVisitedStores = async (env: Bindings, userId: string): Promise<string[]> => {
  const prisma = new PrismaClient({ adapter: new PrismaD1(env.DB) })

  const stores = await prisma.userVisitedStore.findMany({
    where: { userId },
    select: { storeKey: true }
  })

  return stores.map((s) => s.storeKey)
}

/**
 * 店舗を訪問済みに追加
 * @param env - Cloudflare Workers Bindings
 * @param userId - Firebase Auth UID
 * @param storeKey - 店舗キー（例: biccame-001）
 */
export const addVisitedStore = async (env: Bindings, userId: string, storeKey: string): Promise<void> => {
  const prisma = new PrismaClient({ adapter: new PrismaD1(env.DB) })

  await prisma.userVisitedStore.upsert({
    where: { userId_storeKey: { userId, storeKey } },
    update: {},
    create: { userId, storeKey }
  })
}

/**
 * 店舗を訪問済みから削除
 * @param env - Cloudflare Workers Bindings
 * @param userId - Firebase Auth UID
 * @param storeKey - 店舗キー
 */
export const removeVisitedStore = async (env: Bindings, userId: string, storeKey: string): Promise<void> => {
  const prisma = new PrismaClient({ adapter: new PrismaD1(env.DB) })

  await prisma.userVisitedStore.deleteMany({
    where: { userId, storeKey }
  })
}

/**
 * ユーザーの興味のあるイベント一覧を取得
 * @param env - Cloudflare Workers Bindings
 * @param userId - Firebase Auth UID
 * @returns 興味のあるイベントのeventIdリスト
 */
export const getInterestedEvents = async (env: Bindings, userId: string): Promise<string[]> => {
  const prisma = new PrismaClient({ adapter: new PrismaD1(env.DB) })

  const events = await prisma.userInterestedEvent.findMany({
    where: { userId },
    select: { eventId: true }
  })

  return events.map((e) => e.eventId)
}

/**
 * イベントを興味ありに追加
 * @param env - Cloudflare Workers Bindings
 * @param userId - Firebase Auth UID
 * @param eventId - イベントID
 */
export const addInterestedEvent = async (env: Bindings, userId: string, eventId: string): Promise<void> => {
  const prisma = new PrismaClient({ adapter: new PrismaD1(env.DB) })

  await prisma.userInterestedEvent.upsert({
    where: { userId_eventId: { userId, eventId } },
    update: {},
    create: { userId, eventId }
  })
}

/**
 * イベントを興味ありから削除
 * @param env - Cloudflare Workers Bindings
 * @param userId - Firebase Auth UID
 * @param eventId - イベントID
 */
export const removeInterestedEvent = async (env: Bindings, userId: string, eventId: string): Promise<void> => {
  const prisma = new PrismaClient({ adapter: new PrismaD1(env.DB) })

  await prisma.userInterestedEvent.deleteMany({
    where: { userId, eventId }
  })
}

/**
 * ユーザーの達成済みイベント一覧を取得
 * @param env - Cloudflare Workers Bindings
 * @param userId - Firebase Auth UID
 * @returns 達成済みイベントのeventIdリスト
 */
export const getCompletedEvents = async (env: Bindings, userId: string): Promise<string[]> => {
  const prisma = new PrismaClient({ adapter: new PrismaD1(env.DB) })

  const events = await prisma.userCompletedEvent.findMany({
    where: { userId },
    select: { eventId: true }
  })

  return events.map((e) => e.eventId)
}

/**
 * イベントを達成済みに追加
 * @param env - Cloudflare Workers Bindings
 * @param userId - Firebase Auth UID
 * @param eventId - イベントID
 */
export const addCompletedEvent = async (env: Bindings, userId: string, eventId: string): Promise<void> => {
  const prisma = new PrismaClient({ adapter: new PrismaD1(env.DB) })

  await prisma.userCompletedEvent.upsert({
    where: { userId_eventId: { userId, eventId } },
    update: {},
    create: { userId, eventId }
  })
}

/**
 * イベントを達成済みから削除
 * @param env - Cloudflare Workers Bindings
 * @param userId - Firebase Auth UID
 * @param eventId - イベントID
 */
export const removeCompletedEvent = async (env: Bindings, userId: string, eventId: string): Promise<void> => {
  const prisma = new PrismaClient({ adapter: new PrismaD1(env.DB) })

  await prisma.userCompletedEvent.deleteMany({
    where: { userId, eventId }
  })
}

/**
 * ユーザーのアクティビティ全体を取得
 * @param env - Cloudflare Workers Bindings
 * @param userId - Firebase Auth UID
 */
export const getUserActivity = async (
  env: Bindings,
  userId: string
): Promise<{
  visitedStores: string[]
  interestedEvents: string[]
  completedEvents: string[]
}> => {
  const [visitedStores, interestedEvents, completedEvents] = await Promise.all([
    getVisitedStores(env, userId),
    getInterestedEvents(env, userId),
    getCompletedEvents(env, userId)
  ])

  return { visitedStores, interestedEvents, completedEvents }
}

/**
 * イベントごとの興味あり・達成カウントを取得
 * @param env - Cloudflare Workers Bindings
 * @param eventId - イベントID
 * @returns 興味あり・達成のカウント
 */
export const getEventStats = async (
  env: Bindings,
  eventId: string
): Promise<{ interestedCount: number; completedCount: number }> => {
  const prisma = new PrismaClient({ adapter: new PrismaD1(env.DB) })

  const [interestedCount, completedCount] = await Promise.all([
    prisma.userInterestedEvent.count({ where: { eventId } }),
    prisma.userCompletedEvent.count({ where: { eventId } })
  ])

  return { interestedCount, completedCount }
}

/**
 * 複数イベントの興味あり・達成カウントを一括取得
 * @param env - Cloudflare Workers Bindings
 * @param eventIds - イベントIDの配列
 * @returns イベントIDをキーにしたカウントのマップ
 */
export const getEventsStats = async (
  env: Bindings,
  eventIds: string[]
): Promise<Record<string, { interestedCount: number; completedCount: number }>> => {
  if (eventIds.length === 0) return {}

  const prisma = new PrismaClient({ adapter: new PrismaD1(env.DB) })

  const [interestedCounts, completedCounts] = await Promise.all([
    prisma.userInterestedEvent.groupBy({
      by: ['eventId'],
      where: { eventId: { in: eventIds } },
      _count: { eventId: true }
    }),
    prisma.userCompletedEvent.groupBy({
      by: ['eventId'],
      where: { eventId: { in: eventIds } },
      _count: { eventId: true }
    })
  ])

  const result: Record<string, { interestedCount: number; completedCount: number }> = {}

  for (const id of eventIds) {
    result[id] = { interestedCount: 0, completedCount: 0 }
  }

  for (const item of interestedCounts) {
    result[item.eventId].interestedCount = item._count.eventId
  }

  for (const item of completedCounts) {
    result[item.eventId].completedCount = item._count.eventId
  }

  return result
}
