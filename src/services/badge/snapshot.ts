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
// UserSnapshot — 1 ユーザーの評価に必要な情報を 3 クエリでまとめて取得する。
// evaluateAndAwardBadges の hot path 用。従来は 1 ユーザーあたり数百クエリになり
// Cloudflare Workers のサブリクエスト上限 (1000) に引っかかっていた (Fable 査読の CRITICAL #2)。
// ---------------------------------------------------------------------------

export type UserSnapshot = {
  visitedStoreKeys: Set<string>
  completedEventCount: number
  completedEventIds: Set<string>
  /** storeKey → その storeKey を含む完了イベントの件数。event_clear_at_store の count>=2 対応で必要。 */
  completedEventStoreCounts: Map<string, number>
  voteTotal: number
}

export async function getUserSnapshot(ctx: EvaluatorContext): Promise<UserSnapshot> {
  const [visited, completed, voteTotal] = await Promise.all([
    ctx.prisma.userStore.findMany({
      where: { userId: ctx.userId, status: 'visited' },
      select: { storeKey: true }
    }),
    ctx.prisma.userEvent.findMany({
      where: { userId: ctx.userId, status: 'completed' },
      select: {
        eventId: true,
        event: { select: { stores: { select: { storeKey: true } } } }
      }
    }),
    ctx.prisma.vote.count({ where: { userId: ctx.userId } })
  ])

  const visitedStoreKeys = new Set(visited.map((v) => v.storeKey))
  const completedEventIds = new Set(completed.map((e) => e.eventId))
  const completedEventStoreCounts = new Map<string, number>()
  for (const ue of completed) {
    for (const es of ue.event.stores) {
      completedEventStoreCounts.set(es.storeKey, (completedEventStoreCounts.get(es.storeKey) ?? 0) + 1)
    }
  }

  return {
    visitedStoreKeys,
    completedEventCount: completed.length,
    completedEventIds,
    completedEventStoreCounts,
    voteTotal
  }
}

// ---------------------------------------------------------------------------
// Snapshot ベースの同期判定関数群
// ---------------------------------------------------------------------------

const syncEvalVisit = (s: UserSnapshot, meta: { storeKey: StoreKey }): boolean => s.visitedStoreKeys.has(meta.storeKey)

const syncEvalAreaAny = (s: UserSnapshot, meta: { region: BadgeArea }): boolean => {
  const keys = PHYSICAL_STORE_KEYS.filter((k) => storeKeyToBadgeArea[k] === meta.region)
  if (keys.length === 0) return false
  return keys.some((k) => s.visitedStoreKeys.has(k))
}

const syncEvalAreaComplete = (s: UserSnapshot, meta: { region: BadgeArea }): boolean => {
  const keys = ACTIVE_PHYSICAL_STORE_KEYS.filter((k) => storeKeyToBadgeArea[k] === meta.region)
  if (keys.length === 0) return false
  return keys.every((k) => s.visitedStoreKeys.has(k))
}

const syncEvalCount = (s: UserSnapshot, meta: { count: number }): boolean => {
  let n = 0
  for (const k of ACTIVE_PHYSICAL_STORE_KEYS) {
    if (s.visitedStoreKeys.has(k)) n++
  }
  return n >= meta.count
}

const syncEvalEventCount = (s: UserSnapshot, meta: { count: number }): boolean => s.completedEventCount >= meta.count

const syncEvalEventClearAtStore = (s: UserSnapshot, meta: { storeKey: StoreKey; count?: number }): boolean => {
  const required = meta.count ?? 1
  return (s.completedEventStoreCounts.get(meta.storeKey) ?? 0) >= required
}

const syncEvalEventClearAreaAny = (s: UserSnapshot, meta: { region: BadgeArea }): boolean => {
  const keys = PHYSICAL_STORE_KEYS.filter((k) => storeKeyToBadgeArea[k] === meta.region)
  if (keys.length === 0) return false
  return keys.some((k) => (s.completedEventStoreCounts.get(k) ?? 0) >= 1)
}

const syncEvalEventClearAreaComplete = (s: UserSnapshot, meta: { region: BadgeArea }): boolean => {
  const keys = ACTIVE_PHYSICAL_STORE_KEYS.filter((k) => storeKeyToBadgeArea[k] === meta.region)
  if (keys.length === 0) return false
  return keys.every((k) => (s.completedEventStoreCounts.get(k) ?? 0) >= 1)
}

const syncEvalEventClearCount = (s: UserSnapshot, meta: { count: number }): boolean => {
  let n = 0
  for (const k of ACTIVE_PHYSICAL_STORE_KEYS) {
    if ((s.completedEventStoreCounts.get(k) ?? 0) >= 1) n++
  }
  return n >= meta.count
}

const syncEvalEventClearAll = (s: UserSnapshot): boolean =>
  syncEvalEventClearCount(s, { count: ACTIVE_PHYSICAL_STORE_KEYS.length })

const syncEvalAllAreasAnyVisit = (s: UserSnapshot): boolean =>
  ALL_BADGE_AREAS.every((area) => syncEvalAreaAny(s, { region: area }))

const syncEvalAllAreasAnyEventClear = (s: UserSnapshot): boolean =>
  ALL_BADGE_AREAS.every((area) => syncEvalEventClearAreaAny(s, { region: area }))

const syncEvalVoteTotal = (s: UserSnapshot, meta: { count: number }): boolean => s.voteTotal >= meta.count

const syncEvalSpecialMultiStoreClear = (s: UserSnapshot, meta: { storeKeys: StoreKey[] }): boolean =>
  meta.storeKeys.every((k) => (s.completedEventStoreCounts.get(k) ?? 0) >= 1)

const syncEvalSpecialEventId = (s: UserSnapshot, meta: { eventId: string }): boolean =>
  s.completedEventIds.has(meta.eventId)

const SYNC_EVALUATORS: Record<BadgeSubCategory, (s: UserSnapshot, raw: unknown) => boolean> = {
  visit: (s, raw) => syncEvalVisit(s, StoreKeyMetaSchema.parse(raw)),
  area_any: (s, raw) => syncEvalAreaAny(s, AreaMetaSchema.parse(raw)),
  area_complete: (s, raw) => syncEvalAreaComplete(s, AreaMetaSchema.parse(raw)),
  count: (s, raw) => syncEvalCount(s, CountMetaSchema.parse(raw)),
  event_count: (s, raw) => syncEvalEventCount(s, CountMetaSchema.parse(raw)),
  event_clear_at_store: (s, raw) => syncEvalEventClearAtStore(s, EventClearAtStoreMetaSchema.parse(raw)),
  event_clear_area_any: (s, raw) => syncEvalEventClearAreaAny(s, AreaMetaSchema.parse(raw)),
  event_clear_area_complete: (s, raw) => syncEvalEventClearAreaComplete(s, AreaMetaSchema.parse(raw)),
  event_clear_count: (s, raw) => syncEvalEventClearCount(s, CountMetaSchema.parse(raw)),
  event_clear_all: (s, _raw) => syncEvalEventClearAll(s),
  all_areas_any_visit: (s, _raw) => syncEvalAllAreasAnyVisit(s),
  all_areas_any_event_clear: (s, _raw) => syncEvalAllAreasAnyEventClear(s),
  vote_total: (s, raw) => syncEvalVoteTotal(s, CountMetaSchema.parse(raw)),
  special_multi_store_clear: (s, raw) => syncEvalSpecialMultiStoreClear(s, StoreKeysMetaSchema.parse(raw)),
  special_event_id: (s, raw) => syncEvalSpecialEventId(s, EventIdMetaSchema.parse(raw))
}

/** snapshot に対して単一バッジを判定。conditionMeta の parse エラーは throw する。 */
export function evaluateBadgeWithSnapshot(snapshot: UserSnapshot, badge: Badge): boolean {
  const raw = parseJsonWithSchema(badge.conditionMeta, badgeConditionMetaSchema)
  const sub = badge.subCategory as BadgeSubCategory
  const evaluator = SYNC_EVALUATORS[sub]
  if (!evaluator) {
    throw new Error(`Unknown badge subCategory: ${sub}`)
  }
  try {
    return evaluator(snapshot, raw)
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new Error(`Badge ${badge.code}: invalid conditionMeta for sub_category ${sub} — ${err.message}`)
    }
    throw err
  }
}

/**
 * 壊れた conditionMeta で parse に失敗するバッジがあると、Promise.all 全体が reject して
 * 「正当に条件を満たした他のバッジ」まで付与されなくなる（毒バッジ問題）。
 * このヘルパは 1 バッジの評価失敗をログのみで飲み込み、他バッジの評価を止めない。
 */
export function safeEvaluate(snapshot: UserSnapshot, badge: Badge): boolean {
  try {
    return evaluateBadgeWithSnapshot(snapshot, badge)
  } catch (err) {
    console.error(`[badge-evaluator] evaluation failed for ${badge.code}:`, err)
    return false
  }
}
