import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import type { ClaimVotesResult } from '@/durable-objects/vote-counter'
import { getPrisma } from '@/lib/prisma'
import type { Bindings } from '@/types/bindings'
import { getJSTDateKey, getJSTYear } from '@/utils/vote'

dayjs.extend(utc)
dayjs.extend(timezone)

/**
 * 一括投票結果アイテム
 */
export type BulkVoteResult = {
  characterId: string
  status: 'voted' | 'skipped'
}

const getVoteCounterStub = (env: Bindings) => {
  return env.VOTE_COUNTER.get(env.VOTE_COUNTER.idFromName(String(getJSTYear())))
}

/**
 * 未投票のキャラクターを DO 側で確保する。
 *
 * DO が落ちているときは fail-open で全件通す。賞品のないファン投票なので
 * 厳密性より可用性を優先し、濫用は RATE_LIMITER が受け止める。
 * fail-closed に倒すならこの catch を throw に変えるだけでよい。
 */
const claimVotes = async (env: Bindings, characterIds: string[], ip: string): Promise<ClaimVotesResult> => {
  try {
    return await getVoteCounterStub(env).claimVotes({
      characterIds,
      ip,
      dateKey: getJSTDateKey(),
      bypassLimit: env.ENVIRONMENT === 'local'
    })
  } catch (error) {
    console.error('[vote] claimVotes failed, allowing vote', error)
    return { voted: characterIds, skipped: [] }
  }
}

/**
 * D1 への永続化に失敗した投票の確保を取り消す。
 * ここで失敗しても当日の再投票ができなくなるだけなので握り潰す。
 */
const releaseVotes = async (env: Bindings, characterIds: string[], ip: string): Promise<void> => {
  try {
    await getVoteCounterStub(env).releaseVotes({ characterIds, ip, dateKey: getJSTDateKey() })
  } catch (error) {
    console.error('[vote] releaseVotes failed', error)
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
): Promise<{ status: 'voted' | 'skipped' }> => {
  const { voted } = await claimVotes(env, [characterId], ip)
  if (voted.length === 0) return { status: 'skipped' }

  const prisma = getPrisma(env)
  const currentYear = getJSTYear()

  try {
    await prisma.$transaction([
      prisma.voteCount.upsert({
        where: { characterId_year: { characterId, year: currentYear } },
        update: { count: { increment: 1 } },
        create: { characterId, year: currentYear, count: 1 }
      }),
      prisma.vote.create({
        data: { characterId, ipAddress: ip, userId: userId ?? null }
      })
    ])
  } catch (error) {
    await releaseVotes(env, voted, ip)
    throw error
  }

  return { status: 'voted' }
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
  const uniqueIds = Array.from(new Set(characterIds))
  if (uniqueIds.length === 0) return []

  // 判定とカウンタ加算は DO 側で原子的に済むので、KV 時代の N 並列 read/write が 1 往復になる
  const { voted } = await claimVotes(env, uniqueIds, ip)

  if (voted.length === 0) {
    return uniqueIds.map((characterId) => ({ characterId, status: 'skipped' as const }))
  }

  // DB は voteCount upsert (×N) と vote createMany (×1) を $transaction で 1 ラウンドに
  const prisma = getPrisma(env)
  const currentYear = getJSTYear()

  try {
    await prisma.$transaction([
      ...voted.map((characterId) =>
        prisma.voteCount.upsert({
          where: { characterId_year: { characterId, year: currentYear } },
          update: { count: { increment: 1 } },
          create: { characterId, year: currentYear, count: 1 }
        })
      ),
      prisma.vote.createMany({
        data: voted.map((characterId) => ({ characterId, ipAddress: ip, userId: userId ?? null }))
      })
    ])
  } catch (error) {
    await releaseVotes(env, voted, ip)
    throw error
  }

  // 元の uniqueIds 順を保ったまま結果を返す
  const votedSet = new Set(voted)
  return uniqueIds.map((characterId) => ({
    characterId,
    status: votedSet.has(characterId) ? 'voted' : 'skipped'
  }))
}
