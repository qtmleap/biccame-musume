import { describe, expect, test } from 'bun:test'
import type { Badge } from '@prisma/client'
import { BADGE_REGISTRY, type BadgeDef } from '../../src/data/badges/registry'
import { ACTIVE_PHYSICAL_STORE_KEYS, CLOSED_STORE_KEYS } from '../../src/data/badges/store-exclusion'
import { evaluateBadgeWithSnapshot, type UserSnapshot } from '../../src/services/badge'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * BadgeDef (registry の literal) を Badge (Prisma row) 形に持ち上げる。
 * evaluateBadgeWithSnapshot は conditionMeta を JSON string で受け取るので stringify する。
 */
function toBadge(def: BadgeDef): Badge {
  return {
    code: def.code,
    category: def.category,
    subCategory: def.subCategory,
    name: def.name,
    description: def.description,
    hint: def.hint,
    rarity: def.rarity,
    iconName: def.iconName,
    sortOrder: def.sortOrder,
    conditionMeta: JSON.stringify(def.conditionMeta),
    isHidden: false,
    createdAt: new Date(),
    updatedAt: new Date()
  }
}

function badgeByCode(code: string): Badge {
  const def = BADGE_REGISTRY.find((b) => b.code === code)
  if (!def) throw new Error(`badge not found in registry: ${code}`)
  return toBadge(def)
}

function makeSnapshot(
  init: {
    visitedStoreKeys?: string[]
    completedEvents?: { eventId: string; storeKeys: string[] }[]
    voteTotal?: number
  } = {}
): UserSnapshot {
  const visitedStoreKeys = new Set(init.visitedStoreKeys ?? [])
  const completedEvents = init.completedEvents ?? []
  const completedEventIds = new Set(completedEvents.map((e) => e.eventId))
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

const ACTIVE_COUNT = ACTIVE_PHYSICAL_STORE_KEYS.length
const CLOSED_LIST = Array.from(CLOSED_STORE_KEYS)

// ---------------------------------------------------------------------------
// milestone_visit_count_* (subCategory: 'count')
// ---------------------------------------------------------------------------

describe('milestone_visit_count_* — 訪問マイルストーン', () => {
  const MILESTONE_5 = badgeByCode('milestone_visit_count_5')
  const MILESTONE_10 = badgeByCode('milestone_visit_count_10')
  const MILESTONE_ALL = badgeByCode('milestone_visit_count_all')

  test('閾値ちょうどで true (off-by-one 対策)', () => {
    const snapshot = makeSnapshot({
      visitedStoreKeys: ACTIVE_PHYSICAL_STORE_KEYS.slice(0, 5)
    })
    expect(evaluateBadgeWithSnapshot(snapshot, MILESTONE_5)).toBe(true)
  })

  test('閾値未満で false', () => {
    const snapshot = makeSnapshot({
      visitedStoreKeys: ACTIVE_PHYSICAL_STORE_KEYS.slice(0, 4)
    })
    expect(evaluateBadgeWithSnapshot(snapshot, MILESTONE_5)).toBe(false)
  })

  test('閾値超過でも true（累積型）', () => {
    const snapshot = makeSnapshot({
      visitedStoreKeys: ACTIVE_PHYSICAL_STORE_KEYS.slice(0, 15)
    })
    expect(evaluateBadgeWithSnapshot(snapshot, MILESTONE_5)).toBe(true)
    expect(evaluateBadgeWithSnapshot(snapshot, MILESTONE_10)).toBe(true)
  })

  test('累積: 15 stores visited なら 5 と 10 は取れるが、それより上のマイルストーンは取れない', () => {
    const snapshot = makeSnapshot({
      visitedStoreKeys: ACTIVE_PHYSICAL_STORE_KEYS.slice(0, 15)
    })
    // 15 なら count_5 / count_10 / count_15 まで true
    const MILESTONE_15 = badgeByCode('milestone_visit_count_15')
    const MILESTONE_20 = badgeByCode('milestone_visit_count_20')
    expect(evaluateBadgeWithSnapshot(snapshot, MILESTONE_15)).toBe(true)
    expect(evaluateBadgeWithSnapshot(snapshot, MILESTONE_20)).toBe(false)
  })

  test('milestone_visit_count_all: 現役全店 visited で true（mythic 到達）', () => {
    const snapshot = makeSnapshot({
      visitedStoreKeys: [...ACTIVE_PHYSICAL_STORE_KEYS]
    })
    expect(evaluateBadgeWithSnapshot(snapshot, MILESTONE_ALL)).toBe(true)
    expect(MILESTONE_ALL.rarity).toBe('mythic')
  })

  test('milestone_visit_count_all: 現役 - 1 店だけでも false', () => {
    const snapshot = makeSnapshot({
      visitedStoreKeys: ACTIVE_PHYSICAL_STORE_KEYS.slice(0, ACTIVE_COUNT - 1)
    })
    expect(evaluateBadgeWithSnapshot(snapshot, MILESTONE_ALL)).toBe(false)
  })

  test('閉店店舗を全部 visited にしても count には貢献しない', () => {
    if (CLOSED_LIST.length === 0) {
      throw new Error('CLOSED_STORE_KEYS is empty; test needs revising')
    }
    // 閉店店舗を全部 visited + 現役を 4 店 visited
    const snapshot = makeSnapshot({
      visitedStoreKeys: [...CLOSED_LIST, ...ACTIVE_PHYSICAL_STORE_KEYS.slice(0, 4)]
    })
    // 現役数が 4 なので count_5 は届かない
    expect(evaluateBadgeWithSnapshot(snapshot, MILESTONE_5)).toBe(false)
    // 現役を 1 追加すると 5 になり true
    const snapshot2 = makeSnapshot({
      visitedStoreKeys: [...CLOSED_LIST, ...ACTIVE_PHYSICAL_STORE_KEYS.slice(0, 5)]
    })
    expect(evaluateBadgeWithSnapshot(snapshot2, MILESTONE_5)).toBe(true)
  })

  test('milestone_visit_count_* の閾値は全部 ACTIVE 数未満', () => {
    const badges = BADGE_REGISTRY.filter(
      (b) => b.code.startsWith('milestone_visit_count_') && b.code !== 'milestone_visit_count_all'
    )
    for (const b of badges) {
      expect(b.conditionMeta.count).toBeLessThan(ACTIVE_COUNT)
    }
  })
})

// ---------------------------------------------------------------------------
// milestone_clear_count_* (subCategory: 'event_clear_count')
// ---------------------------------------------------------------------------

describe('milestone_clear_count_* — 完了店舗マイルストーン', () => {
  const MILESTONE_5 = badgeByCode('milestone_clear_count_5')
  const MILESTONE_ALL = badgeByCode('milestone_clear_count_all')

  test('現役 5 店の完了で milestone_clear_count_5 は true', () => {
    const snapshot = makeSnapshot({
      completedEvents: ACTIVE_PHYSICAL_STORE_KEYS.slice(0, 5).map((sk, i) => ({
        eventId: `ev-${i}`,
        storeKeys: [sk]
      }))
    })
    expect(evaluateBadgeWithSnapshot(snapshot, MILESTONE_5)).toBe(true)
  })

  test('同じ store で複数完了しても 1 店としてカウント（distinct）', () => {
    const [sk] = ACTIVE_PHYSICAL_STORE_KEYS
    const snapshot = makeSnapshot({
      completedEvents: [
        { eventId: 'ev-1', storeKeys: [sk] },
        { eventId: 'ev-2', storeKeys: [sk] },
        { eventId: 'ev-3', storeKeys: [sk] },
        { eventId: 'ev-4', storeKeys: [sk] },
        { eventId: 'ev-5', storeKeys: [sk] }
      ]
    })
    // 5 件完了しているが distinct store は 1 → milestone_clear_count_5 は false
    expect(evaluateBadgeWithSnapshot(snapshot, MILESTONE_5)).toBe(false)
  })

  test('milestone_clear_count_all: 現役全店の完了 event で true（mythic）', () => {
    const snapshot = makeSnapshot({
      completedEvents: ACTIVE_PHYSICAL_STORE_KEYS.map((sk, i) => ({
        eventId: `ev-${i}`,
        storeKeys: [sk]
      }))
    })
    expect(evaluateBadgeWithSnapshot(snapshot, MILESTONE_ALL)).toBe(true)
    expect(MILESTONE_ALL.rarity).toBe('mythic')
  })

  test('閉店店舗の完了は count に加算されない', () => {
    if (CLOSED_LIST.length === 0) {
      throw new Error('CLOSED_STORE_KEYS is empty; test needs revising')
    }
    const snapshot = makeSnapshot({
      completedEvents: [
        // 閉店店舗の完了イベント（無効）
        ...CLOSED_LIST.map((sk, i) => ({ eventId: `closed-${i}`, storeKeys: [sk] })),
        // 現役 4 店の完了イベント
        ...ACTIVE_PHYSICAL_STORE_KEYS.slice(0, 4).map((sk, i) => ({
          eventId: `active-${i}`,
          storeKeys: [sk]
        }))
      ]
    })
    // 現役 4 店なので milestone_clear_count_5 には届かない
    expect(evaluateBadgeWithSnapshot(snapshot, MILESTONE_5)).toBe(false)
  })

  test('milestone_clear_count_* の閾値は全部 ACTIVE 数未満', () => {
    const badges = BADGE_REGISTRY.filter((b) => b.subCategory === 'event_clear_count')
    for (const b of badges) {
      expect(b.conditionMeta.count).toBeLessThan(ACTIVE_COUNT)
    }
  })
})

// ---------------------------------------------------------------------------
// event_count_* (subCategory: 'event_count')
// ---------------------------------------------------------------------------

describe('event_count_* — イベント参加マイルストーン', () => {
  test('completedEventCount が閾値以上で true', () => {
    const EVENT_10 = badgeByCode('event_count_10')
    const snapshot = makeSnapshot({
      completedEvents: Array.from({ length: 10 }, (_, i) => ({
        eventId: `ev-${i}`,
        storeKeys: []
      }))
    })
    expect(evaluateBadgeWithSnapshot(snapshot, EVENT_10)).toBe(true)
  })

  test('completedEventCount が閾値 - 1 で false', () => {
    const EVENT_10 = badgeByCode('event_count_10')
    const snapshot = makeSnapshot({
      completedEvents: Array.from({ length: 9 }, (_, i) => ({
        eventId: `ev-${i}`,
        storeKeys: []
      }))
    })
    expect(evaluateBadgeWithSnapshot(snapshot, EVENT_10)).toBe(false)
  })

  test('storeKey は無関係（storeKeys が空でも件数だけで判定）', () => {
    const EVENT_1 = badgeByCode('event_count_1')
    const snapshot = makeSnapshot({
      completedEvents: [{ eventId: 'ev-1', storeKeys: [] }]
    })
    expect(evaluateBadgeWithSnapshot(snapshot, EVENT_1)).toBe(true)
  })

  test('累積: 100 件参加なら count_1 / count_10 / count_100 全部 true', () => {
    const snapshot = makeSnapshot({
      completedEvents: Array.from({ length: 100 }, (_, i) => ({
        eventId: `ev-${i}`,
        storeKeys: []
      }))
    })
    expect(evaluateBadgeWithSnapshot(snapshot, badgeByCode('event_count_1'))).toBe(true)
    expect(evaluateBadgeWithSnapshot(snapshot, badgeByCode('event_count_10'))).toBe(true)
    expect(evaluateBadgeWithSnapshot(snapshot, badgeByCode('event_count_100'))).toBe(true)
    expect(evaluateBadgeWithSnapshot(snapshot, badgeByCode('event_count_125'))).toBe(false)
  })

  test('legendary 最上位 event_count_575 は 575 件で true', () => {
    const EVENT_575 = badgeByCode('event_count_575')
    expect(EVENT_575.rarity).toBe('legendary')
    const snapshot = makeSnapshot({
      completedEvents: Array.from({ length: 575 }, (_, i) => ({
        eventId: `ev-${i}`,
        storeKeys: []
      }))
    })
    expect(evaluateBadgeWithSnapshot(snapshot, EVENT_575)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// vote_total_* (subCategory: 'vote_total')
// ---------------------------------------------------------------------------

describe('vote_total_* — 投票マイルストーン', () => {
  test('vote count が閾値以上で true / 未満で false', () => {
    const VOTE_10 = badgeByCode('vote_total_10')
    expect(evaluateBadgeWithSnapshot(makeSnapshot({ voteTotal: 10 }), VOTE_10)).toBe(true)
    expect(evaluateBadgeWithSnapshot(makeSnapshot({ voteTotal: 9 }), VOTE_10)).toBe(false)
  })

  test('累積: 1000 投票なら vote_total_1 〜 vote_total_1000 全部 true', () => {
    const snapshot = makeSnapshot({ voteTotal: 1000 })
    for (const code of ['vote_total_1', 'vote_total_10', 'vote_total_100', 'vote_total_500', 'vote_total_1000']) {
      expect(evaluateBadgeWithSnapshot(snapshot, badgeByCode(code))).toBe(true)
    }
  })

  test('vote_total_1000 は legendary', () => {
    expect(badgeByCode('vote_total_1000').rarity).toBe('legendary')
  })
})

// ---------------------------------------------------------------------------
// milestone_visit_areas / milestone_clear_areas (all-areas 系)
// ---------------------------------------------------------------------------

describe('all-areas milestone (milestone_visit_areas / milestone_clear_areas)', () => {
  const ALL_AREAS = [
    'hokkaido',
    'kanto_north',
    'chiba',
    'tokyo_metro',
    'shinjuku_shibuya',
    'ikebukuro',
    'kanagawa',
    'chubu',
    'sanyo_kinki',
    'kyushu'
  ] as const

  // 各エリアの代表的な現役店舗を実データから 1 つ拾う
  // area_any は PHYSICAL ベースなので、閉店店舗しか無いエリアはさすがに無い想定
  const areaSample: Record<string, string> = {
    hokkaido: 'sapporo',
    kanto_north: 'ohmiya', // 大宮 (関東北)
    chiba: 'chiba',
    tokyo_metro: 'akiba',
    shinjuku_shibuya: 'shinjyuku',
    ikebukuro: 'honten',
    kanagawa: 'kawasaki',
    chubu: 'nagoya',
    sanyo_kinki: 'nanba',
    kyushu: 'tenjin'
  }

  test('milestone_visit_areas: 全 10 エリアで 1 店ずつ visited なら true', () => {
    const badge = badgeByCode('milestone_visit_areas')
    const snapshot = makeSnapshot({
      visitedStoreKeys: ALL_AREAS.map((a) => areaSample[a])
    })
    expect(evaluateBadgeWithSnapshot(snapshot, badge)).toBe(true)
    expect(badge.rarity).toBe('epic')
  })

  test('milestone_visit_areas: 1 エリア (kyushu) が欠けたら false', () => {
    const badge = badgeByCode('milestone_visit_areas')
    const snapshot = makeSnapshot({
      visitedStoreKeys: ALL_AREAS.filter((a) => a !== 'kyushu').map((a) => areaSample[a])
    })
    expect(evaluateBadgeWithSnapshot(snapshot, badge)).toBe(false)
  })

  test('milestone_clear_areas: 全 10 エリアで 1 店ずつ完了なら true', () => {
    const badge = badgeByCode('milestone_clear_areas')
    const snapshot = makeSnapshot({
      completedEvents: ALL_AREAS.map((a, i) => ({
        eventId: `ev-${i}`,
        storeKeys: [areaSample[a]]
      }))
    })
    expect(evaluateBadgeWithSnapshot(snapshot, badge)).toBe(true)
    expect(badge.rarity).toBe('legendary')
  })

  test('milestone_clear_areas: 1 エリア欠けたら false', () => {
    const badge = badgeByCode('milestone_clear_areas')
    const snapshot = makeSnapshot({
      completedEvents: ALL_AREAS.filter((a) => a !== 'hokkaido').map((a, i) => ({
        eventId: `ev-${i}`,
        storeKeys: [areaSample[a]]
      }))
    })
    expect(evaluateBadgeWithSnapshot(snapshot, badge)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// マイルストーン全体の整合性 — registry と評価が一致していること
// ---------------------------------------------------------------------------

describe('milestone integrity', () => {
  test('milestone_visit_count_all の conditionMeta.count は ACTIVE 数と一致', () => {
    const badge = badgeByCode('milestone_visit_count_all')
    expect(badge.conditionMeta).toContain(`"count":${ACTIVE_COUNT}`)
  })

  test('milestone_clear_count_all の subCategory は event_clear_all', () => {
    const def = BADGE_REGISTRY.find((b) => b.code === 'milestone_clear_count_all')
    expect(def?.subCategory).toBe('event_clear_all')
  })

  test('milestone_visit_count_* の Rarity 段階が閾値順に単調', () => {
    // 上位マイルストーンほど rarity が上がる（同 rarity は許容）
    const RARITY_ORDER: Record<string, number> = {
      common: 0,
      rare: 1,
      epic: 2,
      legendary: 3,
      mythic: 4
    }
    const badges = BADGE_REGISTRY.filter((b) => b.code.startsWith('milestone_visit_count_'))
      .filter((b) => b.code !== 'milestone_visit_count_all')
      .sort((a, b) => (a.conditionMeta.count ?? 0) - (b.conditionMeta.count ?? 0))
    for (let i = 1; i < badges.length; i++) {
      expect(RARITY_ORDER[badges[i].rarity]).toBeGreaterThanOrEqual(RARITY_ORDER[badges[i - 1].rarity])
    }
  })

  test('event_count_* の rarity 段階も閾値順に単調', () => {
    const RARITY_ORDER: Record<string, number> = {
      common: 0,
      rare: 1,
      epic: 2,
      legendary: 3,
      mythic: 4
    }
    const badges = BADGE_REGISTRY.filter((b) => b.subCategory === 'event_count').sort(
      (a, b) => (a.conditionMeta.count ?? 0) - (b.conditionMeta.count ?? 0)
    )
    for (let i = 1; i < badges.length; i++) {
      expect(RARITY_ORDER[badges[i].rarity]).toBeGreaterThanOrEqual(RARITY_ORDER[badges[i - 1].rarity])
    }
  })

  test('vote_total_* の rarity 段階も閾値順に単調', () => {
    const RARITY_ORDER: Record<string, number> = {
      common: 0,
      rare: 1,
      epic: 2,
      legendary: 3,
      mythic: 4
    }
    const badges = BADGE_REGISTRY.filter((b) => b.subCategory === 'vote_total').sort(
      (a, b) => (a.conditionMeta.count ?? 0) - (b.conditionMeta.count ?? 0)
    )
    for (let i = 1; i < badges.length; i++) {
      expect(RARITY_ORDER[badges[i].rarity]).toBeGreaterThanOrEqual(RARITY_ORDER[badges[i - 1].rarity])
    }
  })
})
