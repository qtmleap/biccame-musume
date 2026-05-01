import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { getPrisma } from '@/lib/prisma'
import type { Bindings } from '@/types/bindings'

dayjs.extend(utc)
dayjs.extend(timezone)

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
 * @returns 投票結果
 */
export const vote = async (
  env: Bindings,
  characterId: string,
  ip: string
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
