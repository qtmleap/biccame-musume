import type { Badge, PrismaClient } from '@prisma/client'
import { Prisma } from '@prisma/client'
import type { BadgeArea } from '@/data/badges/area-mapping'
import { storeKeyToBadgeArea } from '@/data/badges/area-mapping'
import type { BadgeSubCategory } from '@/data/badges/registry'
import { PHYSICAL_STORE_KEYS } from '@/data/badges/store-exclusion'
import { parseJsonWithSchema } from '@/lib/parse-json'
import type { StoreKey } from '@/schemas/store.dto'
import type { Bindings } from '@/types/bindings'
import { badgeConditionMetaSchema, type EvaluatorContext } from './schemas'
import { getUserSnapshot, safeEvaluate } from './snapshot'

export {
  evaluateAllAreasAnyEventClear,
  evaluateAllAreasAnyVisit,
  evaluateAreaAny,
  evaluateAreaComplete,
  evaluateBadge,
  evaluateCount,
  evaluateEventClearAll,
  evaluateEventClearAreaAny,
  evaluateEventClearAreaComplete,
  evaluateEventClearAtStore,
  evaluateEventClearCount,
  evaluateEventCount,
  evaluateSpecialEventId,
  evaluateSpecialMultiStoreClear,
  evaluateVisit,
  evaluateVoteTotal
} from './individual'
// --- Public re-exports (backwards compat: 外部は `@/services/badge-evaluator` から import) ---
export type { EvaluatorContext } from './schemas'
export type { UserSnapshot } from './snapshot'
export { evaluateBadgeWithSnapshot, getUserSnapshot } from './snapshot'

// ---------------------------------------------------------------------------
// Batch: 1 ユーザーに対して未取得バッジをまとめて評価・付与する
// ---------------------------------------------------------------------------

/**
 * Evaluate all not-yet-earned badges (or the specified subset) for a user.
 * Inserts UserBadge rows for newly earned badges and returns them.
 *
 * 1 ユーザーあたりのクエリ数は 5 + 付与バッジ数に集約されている：
 *   1. userBadge の list (獲得済み badgeCode)
 *   2. badge の list (candidate)
 *   3-5. userStore(visited) / userEvent(completed)+stores / vote.count — snapshot 用
 *   ...(付与するバッジ数だけ userBadge.create)
 */
export async function evaluateAndAwardBadges(ctx: EvaluatorContext, candidateCodes?: string[]): Promise<Badge[]> {
  const earned = await ctx.prisma.userBadge.findMany({
    where: { userId: ctx.userId },
    select: { badgeCode: true }
  })
  const earnedSet = new Set(earned.map((b) => b.badgeCode))

  // 未取得判定は D1 バインド上限に引っかからないよう JS 側で行う。
  // 隠しバッジ（is_hidden）も獲得可能とする仕様（一覧非表示だけ）。
  const rawCandidates = await ctx.prisma.badge.findMany({
    where: candidateCodes ? { code: { in: candidateCodes } } : undefined
  })
  const candidates = rawCandidates.filter((b) => !earnedSet.has(b.code))
  if (candidates.length === 0) return []

  // 全 candidate をメモリ判定するために 3 クエリで snapshot を作る。
  const snapshot = await getUserSnapshot(ctx)

  const results = await Promise.all(
    candidates.map(async (badge) => {
      const isEarned = safeEvaluate(snapshot, badge)
      if (!isEarned) return null
      try {
        await ctx.prisma.userBadge.create({
          data: { userId: ctx.userId, badgeCode: badge.code }
        })
        return badge
      } catch (err) {
        // 同時付与で UNIQUE(userId, badgeCode) 違反になった場合だけ黙って飲む。
        // それ以外は D1 障害 / FK エラー等の観測対象なのでログを残す。
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          return null
        }
        console.error(`[badge-evaluator] failed to award ${badge.code} to ${ctx.userId}:`, err)
        return null
      }
    })
  )

  return results.filter((b): b is Badge => b !== null)
}

// ---------------------------------------------------------------------------
// Hook helpers — 各トリガーで評価すべき candidate 集合を絞り込む
// ---------------------------------------------------------------------------

/**
 * Called from PUT /me/stores/:storeKey when status='visited'.
 * Evaluates: visit[storeKey], area_any[region], area_complete[region],
 *   milestone_visit_count_*, milestone_visit_count_all, milestone_visit_areas
 */
export async function evaluateOnVisit(ctx: EvaluatorContext, storeKey: StoreKey): Promise<Badge[]> {
  const area = storeKeyToBadgeArea[storeKey]

  const allBadges = await ctx.prisma.badge.findMany({ select: { code: true } })

  const candidateCodes = allBadges
    .map((b) => b.code)
    .filter((code) => {
      return (
        code === `store_visit_${storeKey}` ||
        code === `area_any_${area}` ||
        code === `area_complete_${area}` ||
        code.startsWith('milestone_visit_count_') ||
        code === 'milestone_visit_areas'
      )
    })

  return evaluateAndAwardBadges(ctx, candidateCodes)
}

/**
 * Called from PUT /me/events/:eventId when status='completed'.
 * Evaluates: event_count[*], event_clear_at_store[storeKey], event_clear_area_any[region],
 *   event_clear_area_complete[region], event_clear_count[*], event_clear_all,
 *   special_event_id[eventId], special_multi_store_clear[storeKeys]
 */
export async function evaluateOnEventComplete(ctx: EvaluatorContext, eventId: string): Promise<Badge[]> {
  const eventStores = await ctx.prisma.eventStore.findMany({
    where: { eventId },
    select: { storeKey: true }
  })
  const storeKeys = eventStores.map((es) => es.storeKey)

  const areas = new Set(
    storeKeys
      .filter((sk) => (PHYSICAL_STORE_KEYS as string[]).includes(sk))
      .map((sk) => storeKeyToBadgeArea[sk as StoreKey])
  )

  const allBadges = await ctx.prisma.badge.findMany({
    select: { code: true, subCategory: true, conditionMeta: true }
  })

  // conditionMeta が壊れているバッジは candidate 選定でも Zod 失敗させず、
  // 「対象外」扱いにして他バッジを巻き添えにしない（毒バッジ問題対策）。
  const safeMatchesRegion = (raw: string, region: BadgeArea | undefined): boolean => {
    if (region === undefined) return false
    try {
      const meta = parseJsonWithSchema(raw, badgeConditionMetaSchema)
      return meta.region === region
    } catch {
      return false
    }
  }
  const safeMatchesEvent = (raw: string): boolean => {
    try {
      const meta = parseJsonWithSchema(raw, badgeConditionMetaSchema)
      return meta.eventId === eventId
    } catch {
      return false
    }
  }
  const safeMatchesStores = (raw: string): boolean => {
    try {
      const meta = parseJsonWithSchema(raw, badgeConditionMetaSchema)
      return (meta.storeKeys ?? []).some((sk) => storeKeys.includes(sk))
    } catch {
      return false
    }
  }
  const safeMatchesStoreKey = (raw: string): boolean => {
    try {
      const meta = parseJsonWithSchema(raw, badgeConditionMetaSchema)
      return storeKeys.includes(meta.storeKey ?? '')
    } catch {
      return false
    }
  }

  const candidateCodes = allBadges
    .filter((b) => {
      const sub = b.subCategory as BadgeSubCategory
      if (sub === 'event_count') return true
      if (sub === 'event_clear_count') return true
      if (sub === 'event_clear_all') return true
      if (sub === 'all_areas_any_event_clear') return true
      if (sub === 'special_event_id') return safeMatchesEvent(b.conditionMeta)
      if (sub === 'special_multi_store_clear') return safeMatchesStores(b.conditionMeta)
      if (sub === 'event_clear_at_store') return safeMatchesStoreKey(b.conditionMeta)
      if (sub === 'event_clear_area_any' || sub === 'event_clear_area_complete') {
        // areas は最大 10 個なので線形探索でOK。
        for (const region of areas) {
          if (safeMatchesRegion(b.conditionMeta, region)) return true
        }
        return false
      }
      return false
    })
    .map((b) => b.code)

  return evaluateAndAwardBadges(ctx, candidateCodes)
}

/**
 * Called from POST /votes/* when a vote is cast for a characterId by an authenticated user.
 * Evaluates: vote_total[*]
 */
export async function evaluateOnVote(ctx: EvaluatorContext, _characterId: string): Promise<Badge[]> {
  const allBadges = await ctx.prisma.badge.findMany({
    select: { code: true, subCategory: true }
  })

  const candidateCodes = allBadges
    .filter((b) => {
      const sub = b.subCategory as BadgeSubCategory
      return sub === 'vote_total'
    })
    .map((b) => b.code)

  return evaluateAndAwardBadges(ctx, candidateCodes)
}

// ---------------------------------------------------------------------------
// Scheduled re-evaluation (cron & admin recalculate)
// ---------------------------------------------------------------------------

export type EvaluateAllUsersOptions = {
  /**
   * 指定すると、`stores` / `events` のいずれかで `updatedAt >= since` の
   * mutation があったユーザーだけを評価対象にする。cron の日次実行で使う。
   * 未指定なら全ユーザー（admin recalculate 用）。
   */
  since?: Date
}

/**
 * 全ユーザー（or 直近活動があったユーザー）に対して未取得バッジを再評価する。
 * Workers CPU 制限を考慮して chunk 単位で逐次実行し、chunk 内はユーザーごとに並列。
 */
export async function evaluateAllUsersBadges(
  env: Bindings,
  prisma: PrismaClient,
  chunkSize = 25,
  options: EvaluateAllUsersOptions = {}
): Promise<{ processedUsers: number; totalAwarded: number }> {
  const users = await prisma.user.findMany({
    where:
      options.since === undefined
        ? undefined
        : {
            OR: [
              { stores: { some: { updatedAt: { gte: options.since } } } },
              { events: { some: { updatedAt: { gte: options.since } } } }
            ]
          },
    select: { id: true }
  })

  let totalAwarded = 0
  for (let i = 0; i < users.length; i += chunkSize) {
    const chunk = users.slice(i, i + chunkSize)
    const awarded = await Promise.all(
      chunk.map((u) =>
        evaluateAndAwardBadges({ env, prisma, userId: u.id })
          .then((badges) => badges.length)
          .catch((err) => {
            // 1 ユーザーの失敗で chunk 全体を落とさない。
            console.error(`[badge-evaluator] evaluateAllUsersBadges failed for user ${u.id}:`, err)
            return 0
          })
      )
    )
    totalAwarded += awarded.reduce((a, b) => a + b, 0)
  }

  return { processedUsers: users.length, totalAwarded }
}
