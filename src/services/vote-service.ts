import dayjs from 'dayjs'
import { HTTPException } from 'hono/http-exception'
import type { ClaimVotesResult } from '@/durable-objects/vote-counter'
import { getPrisma } from '@/lib/prisma'
import type { Bindings } from '@/types/bindings'
import { loadBiccameMusumeIdSet } from '@/utils/character-whitelist'
import { getJstDateKey, getJstYear } from '@/utils/jst-date'

/**
 * 一括投票結果アイテム
 */
export type BulkVoteResult = {
  characterId: string
  status: 'voted' | 'skipped'
}

const validateCharacterIds = async (env: Bindings, characterIds: string[], baseUrl: string): Promise<void> => {
  const validIds = await loadBiccameMusumeIdSet(env.ASSETS, baseUrl)
  if (characterIds.some((id) => !validIds.has(id))) {
    throw new HTTPException(400, { message: '投票対象のキャラクターが見つかりません。' })
  }
}

type VoteContext = {
  dateKey: string
  year: number
  stub: ReturnType<Bindings['VOTE_COUNTER']['get']>
}

// 検証後にDOを取得し、処理中に日付・年度が変わっても同じ確保を補償する。
const createVoteContext = (env: Bindings, nowIso: string): VoteContext => {
  const year = getJstYear(nowIso)
  return {
    dateKey: getJstDateKey(nowIso),
    year,
    stub: env.VOTE_COUNTER.get(env.VOTE_COUNTER.idFromName(String(year)))
  }
}

/**
 * 未投票のキャラクターを DO 側で確保する。
 *
 * DO が落ちているときは fail-open で全件通す。賞品のないファン投票なので
 * 厳密性より可用性を優先し、濫用は RATE_LIMITER が受け止める。
 * fail-closed に倒すならこの catch を throw に変えるだけでよい。
 */
const claimVotes = async (
  env: Bindings,
  context: VoteContext,
  characterIds: string[],
  ip: string
): Promise<ClaimVotesResult> => {
  try {
    return await context.stub.claimVotes({
      characterIds,
      ip,
      dateKey: context.dateKey,
      bypassLimit: env.VOTE_LIMIT_BYPASS === 'true'
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
const releaseVotes = async (context: VoteContext, characterIds: string[], ip: string): Promise<void> => {
  try {
    await context.stub.releaseVotes({ characterIds, ip, dateKey: context.dateKey })
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
      where: { year: year ?? getJstYear(dayjs().toISOString()) },
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
 * @param assetsBaseUrl ASSETS の取得元 URL（API 呼出し時はリクエスト URL）
 * @returns 投票結果
 */
export const vote = async (
  env: Bindings,
  characterId: string,
  ip: string,
  userId?: string,
  assetsBaseUrl = 'https://biccame-musume.com'
): Promise<{ status: 'voted' | 'skipped' }> => {
  const nowIso = dayjs().toISOString()
  await validateCharacterIds(env, [characterId], assetsBaseUrl)
  const context = createVoteContext(env, nowIso)
  const { voted } = await claimVotes(env, context, [characterId], ip)
  if (voted.length === 0) return { status: 'skipped' }

  const prisma = getPrisma(env)
  const currentYear = context.year

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
    await releaseVotes(context, voted, ip)
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
 * @param assetsBaseUrl ASSETS の取得元 URL（API 呼出し時はリクエスト URL）
 * @returns キャラクター毎の投票結果
 */
export const bulkVote = async (
  env: Bindings,
  characterIds: string[],
  ip: string,
  userId?: string,
  assetsBaseUrl = 'https://biccame-musume.com'
): Promise<BulkVoteResult[]> => {
  const nowIso = dayjs().toISOString()
  const uniqueIds = Array.from(new Set(characterIds))
  if (uniqueIds.length === 0) return []
  await validateCharacterIds(env, uniqueIds, assetsBaseUrl)
  const context = createVoteContext(env, nowIso)

  // 判定とカウンタ加算は DO 側で原子的に済むので、KV 時代の N 並列 read/write が 1 往復になる
  const { voted } = await claimVotes(env, context, uniqueIds, ip)

  if (voted.length === 0) {
    return uniqueIds.map((characterId) => ({ characterId, status: 'skipped' as const }))
  }

  // DB は voteCount upsert (×N) と vote createMany (×1) を $transaction で 1 ラウンドに
  const prisma = getPrisma(env)
  const currentYear = context.year

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
    await releaseVotes(context, voted, ip)
    throw error
  }

  // 元の uniqueIds 順を保ったまま結果を返す
  const votedSet = new Set(voted)
  return uniqueIds.map((characterId) => ({
    characterId,
    status: votedSet.has(characterId) ? 'voted' : 'skipped'
  }))
}
