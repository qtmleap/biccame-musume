import { PrismaD1 } from '@prisma/adapter-d1'
import { PrismaClient } from '@prisma/client/wasm'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import type { Bindings } from '@/types/bindings'
import { generateVoteKey } from '@/utils/vote'

dayjs.extend(utc)
dayjs.extend(timezone)

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

  // 投票レコード作成をバックグラウンドで実行
  await prisma.vote.create({
    data: {
      characterId,
      ipAddress: ip
    }
  })

  return {
    success: true,
    message: '投票ありがとうございます！',
    nextVoteDate: dayjs().add(1, 'day').startOf('day').toISOString()
  }
}
