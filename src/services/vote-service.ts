import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { getPrisma } from '@/lib/prisma'
import { isVoteLimited, markVoteLimited } from '@/middleware/vote-limit'
import type { Bindings } from '@/types/bindings'

dayjs.extend(utc)
dayjs.extend(timezone)

/**
 * 一括投票結果アイテム
 */
export type BulkVoteResult = {
  characterId: string
  status: 'voted' | 'skipped'
}

/**
 * 全キャラクターの投票カウントを取得する
 * @param env Bindings
 * @param year 年度（省略時は現在の年）
 * @returns 投票カウント配列（降順）
 */
export const getAllVoteCounts = async (
  env: Bindings,
  year?: number
): Promise<Array<{ key: string; count: number }>> => {
  const prisma = getPrisma(env)
  return (
    await prisma.voteCount.findMany({
      where: { year: year || dayjs().year() },
      select: {
        characterId: true,
        count: true
      },
      orderBy: { count: 'desc' }
    })
  ).map((v) => ({ key: v.characterId, count: v.count }))
}

/**
 * 投票を実行する
 * @param env Bindings
 * @param characterId キャラクターID
 * @param ip IPアドレス
 * @param userId ログインユーザーのFirebase Auth UID（任意）
 * @returns 投票結果
 */
export const vote = async (
  env: Bindings,
  characterId: string,
  ip: string,
  userId?: string
): Promise<{ success: boolean; message: string; nextVoteDate: string }> => {
  const prisma = getPrisma(env)

  const currentYear = dayjs().year()

  // 投票カウントを更新
  await prisma.voteCount.upsert({
    where: { characterId_year: { characterId: characterId, year: currentYear } },
    update: {
      count: { increment: 1 }
    },
    create: {
      characterId,
      year: currentYear,
      count: 1
    }
  })

  // 投票レコード作成
  await prisma.vote.create({
    data: {
      characterId,
      ipAddress: ip,
      userId: userId ?? null
    }
  })

  return {
    success: true,
    message: '投票ありがとうございます！',
    nextVoteDate: dayjs().add(1, 'day').startOf('day').toISOString()
  }
}

/**
 * 複数キャラクターへの一括投票
 * - 既に本日投票済みのキャラは skipped にして残りだけ通す
 * - dev 環境では制限を無視して全件投票
 *
 * @param env Bindings
 * @param characterIds 投票対象のキャラクターIDの配列
 * @param ip 投票者のIPアドレス
 * @param userId ログインユーザーのFirebase Auth UID（任意）
 * @returns キャラクター毎の投票結果
 */
export const bulkVote = async (
  env: Bindings,
  characterIds: string[],
  ip: string,
  userId?: string
): Promise<BulkVoteResult[]> => {
  const isDev = env.ENVIRONMENT === 'local'
  const uniqueIds = Array.from(new Set(characterIds))
  if (uniqueIds.length === 0) return []

  // 1) rate-limit チェックを並列化 (50 件 → 1 ラウンド)
  const limitChecks = await Promise.all(
    uniqueIds.map(async (characterId) => ({
      characterId,
      limited: await isVoteLimited(env.VOTE_LIMITER, characterId, ip)
    }))
  )

  const toVote = limitChecks.filter(({ limited }) => !limited || isDev).map((x) => x.characterId)

  if (toVote.length === 0) {
    return uniqueIds.map((characterId) => ({ characterId, status: 'skipped' as const }))
  }

  // 2) rate-limit マークも並列化
  // 3) DB は voteCount upsert (×N) と vote createMany (×1) を $transaction で 1 ラウンドに
  const prisma = getPrisma(env)
  const currentYear = dayjs().year()

  await Promise.all([
    Promise.all(toVote.map((characterId) => markVoteLimited(env.VOTE_LIMITER, characterId, ip))),
    prisma.$transaction([
      ...toVote.map((characterId) =>
        prisma.voteCount.upsert({
          where: { characterId_year: { characterId, year: currentYear } },
          update: { count: { increment: 1 } },
          create: { characterId, year: currentYear, count: 1 }
        })
      ),
      prisma.vote.createMany({
        data: toVote.map((characterId) => ({ characterId, ipAddress: ip, userId: userId ?? null }))
      })
    ])
  ])

  // 元の uniqueIds 順を保ったまま結果を返す
  const votedSet = new Set(toVote)
  return uniqueIds.map((characterId) => ({
    characterId,
    status: votedSet.has(characterId) ? 'voted' : 'skipped'
  }))
}
