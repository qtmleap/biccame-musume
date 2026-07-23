import type { Badge } from '@prisma/client'
import { z } from 'zod'
import type { BadgeArea } from '@/data/badges/area-mapping'
import { storeKeyToBadgeArea } from '@/data/badges/area-mapping'
import type { BadgeSubCategory } from '@/data/badges/registry'
import { ACTIVE_PHYSICAL_STORE_KEYS, PHYSICAL_STORE_KEYS } from '@/data/badges/store-exclusion'
import { parseJsonWithSchema } from '@/lib/parse-json'
import type { StoreKey } from '@/schemas/store.dto'
import {
  ALL_BADGE_AREAS,
  AreaMetaSchema,
  badgeConditionMetaSchema,
  CountMetaSchema,
  type EvaluatorContext,
  EventClearAtStoreMetaSchema,
  EventIdMetaSchema,
  StoreKeyMetaSchema,
  StoreKeysMetaSchema
} from './schemas'

// ---------------------------------------------------------------------------
// Individual evaluators — 単一バッジを直接 DB 問い合わせして判定する。
// 主にテストと dispatcher (`evaluateBadge`) からの呼び出し用。
// production の hot path (`evaluateAndAwardBadges`) は snapshot 経由で一括判定する。
// ---------------------------------------------------------------------------

export async function evaluateVisit(ctx: EvaluatorContext, meta: { storeKey: StoreKey }): Promise<boolean> {
  const row = await ctx.prisma.userStore.findFirst({
    where: { userId: ctx.userId, storeKey: meta.storeKey, status: 'visited' }
  })
  return row !== null
}

export async function evaluateAreaAny(ctx: EvaluatorContext, meta: { region: BadgeArea }): Promise<boolean> {
  const storeKeys = PHYSICAL_STORE_KEYS.filter((k) => storeKeyToBadgeArea[k] === meta.region)
  if (storeKeys.length === 0) return false
  const count = await ctx.prisma.userStore.count({
    where: { userId: ctx.userId, storeKey: { in: storeKeys as string[] }, status: 'visited' }
  })
  return count >= 1
}

export async function evaluateAreaComplete(ctx: EvaluatorContext, meta: { region: BadgeArea }): Promise<boolean> {
  // 閉店店舗を除いた現役店舗だけで判定する（閉店店舗を訪問せずともコンプ扱い）
  const storeKeys = ACTIVE_PHYSICAL_STORE_KEYS.filter((k) => storeKeyToBadgeArea[k] === meta.region)
  // 現役店舗が 0 のエリアは、`0 >= 0` で無条件 true になるのを防ぐため常に false。
  if (storeKeys.length === 0) return false
  const count = await ctx.prisma.userStore.count({
    where: { userId: ctx.userId, storeKey: { in: storeKeys as string[] }, status: 'visited' }
  })
  return count >= storeKeys.length
}

export async function evaluateCount(ctx: EvaluatorContext, meta: { count: number }): Promise<boolean> {
  // 閉店店舗を除いた現役店舗だけで判定する（閉店店舗を訪問せずとも count に到達できる）
  const count = await ctx.prisma.userStore.count({
    where: {
      userId: ctx.userId,
      storeKey: { in: ACTIVE_PHYSICAL_STORE_KEYS as string[] },
      status: 'visited'
    }
  })
  return count >= meta.count
}

export async function evaluateEventCount(ctx: EvaluatorContext, meta: { count: number }): Promise<boolean> {
  const count = await ctx.prisma.userEvent.count({
    where: { userId: ctx.userId, status: 'completed' }
  })
  return count >= meta.count
}

export async function evaluateEventClearAtStore(
  ctx: EvaluatorContext,
  meta: { storeKey: StoreKey; count?: number }
): Promise<boolean> {
  const required = meta.count ?? 1
  if (required <= 1) {
    const row = await ctx.prisma.userEvent.findFirst({
      where: {
        userId: ctx.userId,
        status: 'completed',
        event: { stores: { some: { storeKey: meta.storeKey } } }
      }
    })
    return row !== null
  }
  const cleared = await ctx.prisma.userEvent.count({
    where: {
      userId: ctx.userId,
      status: 'completed',
      event: { stores: { some: { storeKey: meta.storeKey } } }
    }
  })
  return cleared >= required
}

export async function evaluateEventClearAreaAny(ctx: EvaluatorContext, meta: { region: BadgeArea }): Promise<boolean> {
  const storeKeys = PHYSICAL_STORE_KEYS.filter((k) => storeKeyToBadgeArea[k] === meta.region)
  if (storeKeys.length === 0) return false
  const row = await ctx.prisma.userEvent.findFirst({
    where: {
      userId: ctx.userId,
      status: 'completed',
      event: { stores: { some: { storeKey: { in: storeKeys as string[] } } } }
    }
  })
  return row !== null
}

export async function evaluateEventClearAreaComplete(
  ctx: EvaluatorContext,
  meta: { region: BadgeArea }
): Promise<boolean> {
  // 閉店店舗を除いた現役店舗だけで判定する（閉店店舗で達成せずともコンプ扱い）
  const storeKeys = ACTIVE_PHYSICAL_STORE_KEYS.filter((k) => storeKeyToBadgeArea[k] === meta.region)
  // 現役店舗が 0 のエリアは、`[].every(Boolean)` が true になるのを防ぐため常に false。
  if (storeKeys.length === 0) return false
  const results = await Promise.all(storeKeys.map((sk) => evaluateEventClearAtStore(ctx, { storeKey: sk })))
  return results.every(Boolean)
}

export async function evaluateEventClearCount(ctx: EvaluatorContext, meta: { count: number }): Promise<boolean> {
  // 現役店舗に絞ってからカウント。閉店店舗の過去クリアは含めない。
  const completedEvents = await ctx.prisma.userEvent.findMany({
    where: { userId: ctx.userId, status: 'completed' },
    select: { event: { select: { stores: { select: { storeKey: true } } } } }
  })
  const clearedStores = new Set<string>()
  for (const ue of completedEvents) {
    for (const es of ue.event.stores) {
      if ((ACTIVE_PHYSICAL_STORE_KEYS as string[]).includes(es.storeKey)) {
        clearedStores.add(es.storeKey)
      }
    }
  }
  return clearedStores.size >= meta.count
}

export async function evaluateEventClearAll(ctx: EvaluatorContext): Promise<boolean> {
  return evaluateEventClearCount(ctx, { count: ACTIVE_PHYSICAL_STORE_KEYS.length })
}

export async function evaluateAllAreasAnyVisit(ctx: EvaluatorContext): Promise<boolean> {
  const results = await Promise.all(ALL_BADGE_AREAS.map((area) => evaluateAreaAny(ctx, { region: area })))
  return results.every(Boolean)
}

export async function evaluateAllAreasAnyEventClear(ctx: EvaluatorContext): Promise<boolean> {
  const results = await Promise.all(ALL_BADGE_AREAS.map((area) => evaluateEventClearAreaAny(ctx, { region: area })))
  return results.every(Boolean)
}

export async function evaluateVoteTotal(ctx: EvaluatorContext, meta: { count: number }): Promise<boolean> {
  const count = await ctx.prisma.vote.count({ where: { userId: ctx.userId } })
  return count >= meta.count
}

export async function evaluateSpecialMultiStoreClear(
  ctx: EvaluatorContext,
  meta: { storeKeys: StoreKey[] }
): Promise<boolean> {
  const results = await Promise.all(meta.storeKeys.map((sk) => evaluateEventClearAtStore(ctx, { storeKey: sk })))
  return results.every(Boolean)
}

export async function evaluateSpecialEventId(ctx: EvaluatorContext, meta: { eventId: string }): Promise<boolean> {
  const row = await ctx.prisma.userEvent.findFirst({
    where: { userId: ctx.userId, eventId: meta.eventId, status: 'completed' }
  })
  return row !== null
}

/**
 * sub_category → 個別評価関数のテーブル（DB クエリベース）。
 * テストや `evaluateBadge` からの呼び出し用。
 */
const EVALUATORS: Record<BadgeSubCategory, (ctx: EvaluatorContext, raw: unknown) => Promise<boolean>> = {
  visit: (ctx, raw) => evaluateVisit(ctx, StoreKeyMetaSchema.parse(raw)),
  area_any: (ctx, raw) => evaluateAreaAny(ctx, AreaMetaSchema.parse(raw)),
  area_complete: (ctx, raw) => evaluateAreaComplete(ctx, AreaMetaSchema.parse(raw)),
  count: (ctx, raw) => evaluateCount(ctx, CountMetaSchema.parse(raw)),
  event_count: (ctx, raw) => evaluateEventCount(ctx, CountMetaSchema.parse(raw)),
  event_clear_at_store: (ctx, raw) => evaluateEventClearAtStore(ctx, EventClearAtStoreMetaSchema.parse(raw)),
  event_clear_area_any: (ctx, raw) => evaluateEventClearAreaAny(ctx, AreaMetaSchema.parse(raw)),
  event_clear_area_complete: (ctx, raw) => evaluateEventClearAreaComplete(ctx, AreaMetaSchema.parse(raw)),
  event_clear_count: (ctx, raw) => evaluateEventClearCount(ctx, CountMetaSchema.parse(raw)),
  event_clear_all: (ctx, _raw) => evaluateEventClearAll(ctx),
  all_areas_any_visit: (ctx, _raw) => evaluateAllAreasAnyVisit(ctx),
  all_areas_any_event_clear: (ctx, _raw) => evaluateAllAreasAnyEventClear(ctx),
  vote_total: (ctx, raw) => evaluateVoteTotal(ctx, CountMetaSchema.parse(raw)),
  special_multi_store_clear: (ctx, raw) => evaluateSpecialMultiStoreClear(ctx, StoreKeysMetaSchema.parse(raw)),
  special_event_id: (ctx, raw) => evaluateSpecialEventId(ctx, EventIdMetaSchema.parse(raw))
}

export async function evaluateBadge(ctx: EvaluatorContext, badge: Badge): Promise<boolean> {
  const raw = parseJsonWithSchema(badge.conditionMeta, badgeConditionMetaSchema)
  const sub = badge.subCategory as BadgeSubCategory
  const evaluator = EVALUATORS[sub]
  if (!evaluator) {
    throw new Error(`Unknown badge subCategory: ${sub}`)
  }
  try {
    return await evaluator(ctx, raw)
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new Error(`Badge ${badge.code}: invalid conditionMeta for sub_category ${sub} — ${err.message}`)
    }
    throw err
  }
}
