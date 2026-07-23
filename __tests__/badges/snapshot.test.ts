import { describe, expect, test } from 'bun:test'
import type { Badge, PrismaClient } from '@prisma/client'
import { storeKeyToBadgeArea } from '../../src/data/badges/area-mapping'
import type { BadgeConditionMeta, BadgeSubCategory } from '../../src/data/badges/registry'
import { ACTIVE_PHYSICAL_STORE_KEYS, CLOSED_STORE_KEYS } from '../../src/data/badges/store-exclusion'
import {
  type EvaluatorContext,
  evaluateAndAwardBadges,
  evaluateBadgeWithSnapshot,
  getUserSnapshot,
  type UserSnapshot
} from '../../src/services/badge'
import { safeEvaluate } from '../../src/services/badge/snapshot'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a UserSnapshot directly for pure evaluator tests.
 * DB モックを介さずに sync evaluators を叩けるのが snapshot 版の利点。
 */
function makeSnapshot(
  init: {
    visitedStoreKeys?: string[]
    completedEventIds?: string[]
    /** eventId → その event が含む storeKey の配列 */
    completedEvents?: { eventId: string; storeKeys: string[] }[]
    voteTotal?: number
  } = {}
): UserSnapshot {
  const visitedStoreKeys = new Set(init.visitedStoreKeys ?? [])
  const completedEvents = init.completedEvents ?? []
  const completedEventIds = new Set(init.completedEventIds ?? completedEvents.map((e) => e.eventId))
  const completedEventStoreCounts = new Map<string, number>()
  for (const ce of completedEvents) {
    for (const sk of ce.storeKeys) {
      completedEventStoreCounts.set(sk, (completedEventStoreCounts.get(sk) ?? 0) + 1)
    }
  }
  return {
    visitedStoreKeys,
    completedEventCount: completedEvents.length,
    completedEventIds,
    completedEventStoreCounts,
    voteTotal: init.voteTotal ?? 0
  }
}

function makeBadge(subCategory: BadgeSubCategory, meta: BadgeConditionMeta, isHidden = false): Badge {
  return {
    code: `test_${subCategory}_${Math.floor(Math.random() * 1e9)}`,
    category: 'store',
    subCategory,
    name: 'Test Badge',
    description: 'Test',
    hint: 'Test',
    rarity: 'common',
    iconName: 'Star',
    sortOrder: 0,
    conditionMeta: JSON.stringify(meta),
    isHidden,
    createdAt: new Date(),
    updatedAt: new Date()
  }
}

// ---------------------------------------------------------------------------
// getUserSnapshot — 3 クエリで snapshot を組み立てる
// ---------------------------------------------------------------------------

describe('getUserSnapshot', () => {
  test('組み立て: visitedStoreKeys / completedEvents / voteTotal / storeCounts', async () => {
    const ctx: EvaluatorContext = {
      env: {} as never,
      userId: 'user-001',
      prisma: {
        userStore: {
          findMany: async () => [{ storeKey: 'akiba' }, { storeKey: 'sapporo' }]
        },
        userEvent: {
          findMany: async () => [
            { eventId: 'ev-1', event: { stores: [{ storeKey: 'akiba' }, { storeKey: 'shinjyuku' }] } },
            { eventId: 'ev-2', event: { stores: [{ storeKey: 'akiba' }] } }
          ]
        },
        vote: {
          count: async () => 42
        }
      } as unknown as PrismaClient
    }

    const snapshot = await getUserSnapshot(ctx)

    expect(snapshot.visitedStoreKeys.has('akiba')).toBe(true)
    expect(snapshot.visitedStoreKeys.has('sapporo')).toBe(true)
    expect(snapshot.visitedStoreKeys.has('shinjyuku')).toBe(false)
    expect(snapshot.completedEventCount).toBe(2)
    expect(snapshot.completedEventIds.has('ev-1')).toBe(true)
    expect(snapshot.completedEventIds.has('ev-2')).toBe(true)
    // akiba は ev-1 と ev-2 の両方に含まれるので 2
    expect(snapshot.completedEventStoreCounts.get('akiba')).toBe(2)
    expect(snapshot.completedEventStoreCounts.get('shinjyuku')).toBe(1)
    expect(snapshot.completedEventStoreCounts.get('sapporo')).toBeUndefined()
    expect(snapshot.voteTotal).toBe(42)
  })

  test('空のユーザーは空 snapshot を返す', async () => {
    const ctx: EvaluatorContext = {
      env: {} as never,
      userId: 'user-empty',
      prisma: {
        userStore: { findMany: async () => [] },
        userEvent: { findMany: async () => [] },
        vote: { count: async () => 0 }
      } as unknown as PrismaClient
    }
    const snapshot = await getUserSnapshot(ctx)
    expect(snapshot.visitedStoreKeys.size).toBe(0)
    expect(snapshot.completedEventCount).toBe(0)
    expect(snapshot.completedEventIds.size).toBe(0)
    expect(snapshot.completedEventStoreCounts.size).toBe(0)
    expect(snapshot.voteTotal).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 空エリアガード — 現役店舗が 0 のエリアは false
// ---------------------------------------------------------------------------

describe('empty-area guard for area_complete / event_clear_area_complete', () => {
  test('area_complete: 現役店舗 0 のエリアで snapshot が空でも false（無条件 true にしない）', () => {
    // hokkaido の現役店舗が仮に 0 になったケースを想定して、
    // ACTIVE から hokkaido を除いた別ロジックで storeKeys が空になっても
    // 「count >= 0」で true にはしないことを担保するのが本来の意図。
    // ここは実データ (hokkaido は現役 1 店 = sapporo) を使って、
    // sapporo が visited でないなら count < length で false を確認する。
    const badge = makeBadge('area_complete', { region: 'hokkaido' })
    const snapshot = makeSnapshot({ visitedStoreKeys: [] })
    expect(evaluateBadgeWithSnapshot(snapshot, badge)).toBe(false)
  })

  test('area_complete: 現役 sapporo を visited にすれば hokkaido は true', () => {
    const badge = makeBadge('area_complete', { region: 'hokkaido' })
    const snapshot = makeSnapshot({ visitedStoreKeys: ['sapporo'] })
    expect(evaluateBadgeWithSnapshot(snapshot, badge)).toBe(true)
  })

  test('event_clear_area_complete: 現役全店の完了イベントがあれば true', () => {
    const badge = makeBadge('event_clear_area_complete', { region: 'hokkaido' })
    const snapshot = makeSnapshot({
      completedEvents: [{ eventId: 'ev-1', storeKeys: ['sapporo'] }]
    })
    expect(evaluateBadgeWithSnapshot(snapshot, badge)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 閉店店舗の除外 — count 系は ACTIVE のみカウント
// ---------------------------------------------------------------------------

describe('closed-store exclusion in count-based evaluators', () => {
  test('count: 閉店店舗を visited にしても count に加算されない', () => {
    const closed = Array.from(CLOSED_STORE_KEYS)
    // 閉店店舗が実際にある前提の testing（実装依存だが 1 つはある想定）
    if (closed.length === 0) {
      // このプロジェクトの現状は閉店ありなのでスキップさせない
      throw new Error('CLOSED_STORE_KEYS is empty; test needs revising')
    }
    const badge = makeBadge('count', { count: 1 })
    // 閉店店舗のみが visited なので count = 0 → 1 未満で false
    const snapshot = makeSnapshot({ visitedStoreKeys: closed })
    expect(evaluateBadgeWithSnapshot(snapshot, badge)).toBe(false)
  })

  test('count: 現役店舗 1 つが visited なら count = 1 で true', () => {
    const badge = makeBadge('count', { count: 1 })
    const snapshot = makeSnapshot({ visitedStoreKeys: [ACTIVE_PHYSICAL_STORE_KEYS[0]] })
    expect(evaluateBadgeWithSnapshot(snapshot, badge)).toBe(true)
  })

  test('event_clear_count: 閉店店舗の完了イベントは count に加算されない', () => {
    const closed = Array.from(CLOSED_STORE_KEYS)
    if (closed.length === 0) {
      throw new Error('CLOSED_STORE_KEYS is empty; test needs revising')
    }
    const badge = makeBadge('event_clear_count', { count: 1 })
    const snapshot = makeSnapshot({
      completedEvents: [{ eventId: 'ev-1', storeKeys: [closed[0]] }]
    })
    expect(evaluateBadgeWithSnapshot(snapshot, badge)).toBe(false)
  })

  test('event_clear_all: 現役全店の完了で mythic 達成', () => {
    const badge = makeBadge('event_clear_all', {})
    const snapshot = makeSnapshot({
      completedEvents: ACTIVE_PHYSICAL_STORE_KEYS.map((sk, i) => ({
        eventId: `ev-${i}`,
        storeKeys: [sk]
      }))
    })
    expect(evaluateBadgeWithSnapshot(snapshot, badge)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// event_clear_at_store の count>=2 対応（snapshot に completedEventStoreCounts で持つ）
// ---------------------------------------------------------------------------

describe('event_clear_at_store with count >= 2', () => {
  test('同じ storeKey の完了イベントが required 件数に達すれば true', () => {
    const badge = makeBadge('event_clear_at_store', { storeKey: 'akiba', count: 3 })
    const snapshot = makeSnapshot({
      completedEvents: [
        { eventId: 'ev-1', storeKeys: ['akiba'] },
        { eventId: 'ev-2', storeKeys: ['akiba'] },
        { eventId: 'ev-3', storeKeys: ['akiba'] }
      ]
    })
    expect(evaluateBadgeWithSnapshot(snapshot, badge)).toBe(true)
  })

  test('件数不足なら false', () => {
    const badge = makeBadge('event_clear_at_store', { storeKey: 'akiba', count: 3 })
    const snapshot = makeSnapshot({
      completedEvents: [
        { eventId: 'ev-1', storeKeys: ['akiba'] },
        { eventId: 'ev-2', storeKeys: ['akiba'] }
      ]
    })
    expect(evaluateBadgeWithSnapshot(snapshot, badge)).toBe(false)
  })

  test('count 未指定は 1 件で true', () => {
    const badge = makeBadge('event_clear_at_store', { storeKey: 'akiba' })
    const snapshot = makeSnapshot({
      completedEvents: [{ eventId: 'ev-1', storeKeys: ['akiba'] }]
    })
    expect(evaluateBadgeWithSnapshot(snapshot, badge)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// safeEvaluate — 毒バッジを飲み込んで false を返す
// ---------------------------------------------------------------------------

describe('safeEvaluate swallows evaluation errors', () => {
  test('壊れた conditionMeta のバッジで throw せず false', () => {
    // sub_category と meta の組み合わせが不整合な badge を作る
    // special_event_id なのに eventId が欠けている
    const poisonBadge: Badge = {
      code: 'poison',
      category: 'special',
      subCategory: 'special_event_id',
      name: 'Poison',
      description: '',
      hint: '',
      rarity: 'common',
      iconName: 'Star',
      sortOrder: 0,
      conditionMeta: JSON.stringify({ storeKeys: ['akiba'] }), // eventId 無し → parse 失敗
      isHidden: false,
      createdAt: new Date(),
      updatedAt: new Date()
    }
    const snapshot = makeSnapshot()
    expect(() => safeEvaluate(snapshot, poisonBadge)).not.toThrow()
    expect(safeEvaluate(snapshot, poisonBadge)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// is_hidden 統一: 隠しバッジも評価対象になる（一覧非表示だけの意味論）
// ---------------------------------------------------------------------------

describe('is_hidden badges are still awardable', () => {
  test('evaluateAndAwardBadges: is_hidden=true のバッジも条件を満たせば付与される', async () => {
    const hiddenBadge = {
      code: 'store_visit_akiba_hidden',
      subCategory: 'visit',
      conditionMeta: JSON.stringify({ storeKey: 'akiba' }),
      isHidden: true, // ★ 隠しバッジ
      category: 'store',
      name: 'Hidden Test',
      description: '',
      hint: '',
      rarity: 'common',
      iconName: 'MapPin',
      sortOrder: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    }
    const created: string[] = []
    const ctx: EvaluatorContext = {
      env: {} as never,
      userId: 'user-001',
      prisma: {
        userBadge: {
          findMany: async () => [],
          create: async ({ data }: { data: { badgeCode: string } }) => {
            created.push(data.badgeCode)
            return { id: 'x' }
          }
        },
        badge: {
          // 評価ロジックが isHidden で除外しない ⇒ where を無視して全件返す
          findMany: async () => [hiddenBadge]
        },
        userStore: { findMany: async () => [{ storeKey: 'akiba' }] },
        userEvent: { findMany: async () => [] },
        vote: { count: async () => 0 }
      } as unknown as PrismaClient
    }
    const result = await evaluateAndAwardBadges(ctx)
    expect(result).toHaveLength(1)
    expect(created).toContain('store_visit_akiba_hidden')
  })
})

// ---------------------------------------------------------------------------
// area / event_clear_area_any は PHYSICAL_STORE_KEYS ベース（閉店店舗の過去訪問も許容）
// ---------------------------------------------------------------------------

describe('any-store area evaluators tolerate visits to closed stores', () => {
  test('area_any: 閉店店舗の過去訪問でも region 一致なら true', () => {
    const closed = Array.from(CLOSED_STORE_KEYS)
    if (closed.length === 0) {
      throw new Error('CLOSED_STORE_KEYS is empty; test needs revising')
    }
    const region = storeKeyToBadgeArea[closed[0]]
    const badge = makeBadge('area_any', { region })
    const snapshot = makeSnapshot({ visitedStoreKeys: [closed[0]] })
    expect(evaluateBadgeWithSnapshot(snapshot, badge)).toBe(true)
  })
})
