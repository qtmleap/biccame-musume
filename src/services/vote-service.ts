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

  const tUpsertStart = Date.now()
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
  const tUpsertEnd = Date.now()

  // 投票レコード作成
  await prisma.vote.create({
    data: {
      characterId,
      ipAddress: ip,
      userId: userId ?? null
    }
  })
  const tCreateEnd = Date.now()

  console.log(`[vote:${characterId}] upsert=${tUpsertEnd - tUpsertStart}ms create=${tCreateEnd - tUpsertEnd}ms`)

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
  const tStart = Date.now()
  const isDev = env.ENVIRONMENT === 'local'
  const results: BulkVoteResult[] = []

  // 重複排除
  const uniqueIds = Array.from(new Set(characterIds))

  for (const characterId of uniqueIds) {
    const tLimitStart = Date.now()
    const limited = await isVoteLimited(env.VOTE_LIMITER, characterId, ip)
    const tLimitEnd = Date.now()
    if (limited && !isDev) {
      results.push({ characterId, status: 'skipped' })
      console.log(`[bulkVote:${characterId}] limit=${tLimitEnd - tLimitStart}ms (skipped)`)
      continue
    }
    await markVoteLimited(env.VOTE_LIMITER, characterId, ip)
    const tMarkEnd = Date.now()
    await vote(env, characterId, ip, userId)
    const tVoteEnd = Date.now()
    results.push({ characterId, status: 'voted' })
    console.log(
      `[bulkVote:${characterId}] limit=${tLimitEnd - tLimitStart}ms mark=${tMarkEnd - tLimitEnd}ms vote=${tVoteEnd - tMarkEnd}ms`
    )
  }

  console.log(`[bulkVote] total=${Date.now() - tStart}ms n=${uniqueIds.length}`)
  return results
}
