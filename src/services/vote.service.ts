import { PrismaD1 } from '@prisma/adapter-d1'
import { PrismaClient } from '@prisma/client'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { HTTPException } from 'hono/http-exception'
import type { Bindings } from '@/types/bindings'
import { generateVoteKey } from '@/utils/vote'

dayjs.extend(utc)
dayjs.extend(timezone)

/**
 * 投票の重複チェックを行う
 * @param votesKV KVNamespace
 * @param characterId キャラクターID
 * @param ip IPアドレス
 * @param isDevelopment 開発環境かどうか
 * @returns 重複している場合true（開発環境の場合は常にfalse）
 */
export const checkDuplicateVote = async (
  votesKV: KVNamespace,
  characterId: string,
  ip: string,
  isDevelopment = false
): Promise<boolean> => {
  if (isDevelopment) {
    return false
  }

  const voteKey = generateVoteKey(characterId, ip)
  const existingVote = await votesKV.get(voteKey)
  return existingVote !== null
}

/**
 * 投票を記録する（KVに保存、JST0時までの秒数をTTLに設定）
 * @param votesKV KVNamespace
 * @param characterId キャラクターID
 * @param ip IPアドレス
 */
export const recordVote = async (votesKV: KVNamespace, characterId: string, ip: string): Promise<void> => {
  const jstNow = dayjs()
  const jstMidnight = jstNow.endOf('day')
  const ttl = jstMidnight.diff(jstNow, 'second')

  const voteKey = generateVoteKey(characterId, ip)
  await votesKV.put(voteKey, dayjs().toISOString(), { expirationTtl: ttl })
}

/**
 * 投票カウントを更新する（D1に保存）
 * @param prisma PrismaClient
 * @param characterId キャラクターID
 */
export const updateVoteCount = async (prisma: PrismaClient, characterId: string): Promise<void> => {
  try {
    const currentYear = dayjs().year()

    await prisma.voteCount.upsert({
      where: { characterId_year: { characterId, year: currentYear } },
      update: {
        count: { increment: 1 }
      },
      create: {
        characterId,
        year: currentYear,
        count: 1
      }
    })
  } catch (error) {
    console.error('Vote count update error:', error)
    throw error
  }
}

/**
 * D1に投票レコードを作成する
 * @param prisma PrismaClient
 * @param characterId キャラクターID
 * @param ip IPアドレス
 */
export const createVoteRecord = async (prisma: PrismaClient, characterId: string, ip: string): Promise<void> => {
  try {
    await prisma.vote.create({
      data: {
        characterId,
        ipAddress: ip
      }
    })
  } catch (error) {
    console.error('Vote record creation error:', error)
    throw error
  }
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
  const prisma = new PrismaClient({ adapter: new PrismaD1(env.DB) })
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
 * @returns 投票結果
 */
export const vote = async (
  env: Bindings,
  characterId: string,
  ip: string
): Promise<{ success: boolean; message: string; nextVoteDate: string }> => {
  const prisma = new PrismaClient({ adapter: new PrismaD1(env.DB) })

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
  return
}
