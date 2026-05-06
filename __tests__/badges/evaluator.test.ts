import { describe, expect, test } from 'bun:test'
import type { Badge, PrismaClient } from '@prisma/client'
import { storeKeyToBadgeArea } from '../../src/data/badges/area-mapping'
import type { BadgeConditionMeta, BadgeSubCategory } from '../../src/data/badges/registry'
import { PHYSICAL_STORE_KEYS } from '../../src/data/badges/store-exclusion'
import type { StoreKey } from '../../src/schemas/store.dto'
import {
  type EvaluatorContext,
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
  evaluateVoteAllBiccame,
  evaluateVoteDevotion,
  evaluateVoteTotal,
  evaluateVoteUnique
} from '../../src/services/badge-evaluator'

// ---------------------------------------------------------------------------
// Helper to build a minimal EvaluatorContext with an injected prisma mock.
// ---------------------------------------------------------------------------

function makeCtx(prismaOverrides: Partial<PrismaClient>): EvaluatorContext {
  return {
    env: {} as never,
    prisma: prismaOverrides as unknown as PrismaClient,
    userId: 'user-001'
  }
}

// ---------------------------------------------------------------------------
// evaluateVisit
// ---------------------------------------------------------------------------

describe('evaluateVisit', () => {
  test('returns true when UserStore row exists with visited status', async () => {
    const ctx = makeCtx({
      userStore: {
        findFirst: async () => ({ id: 'row-1', userId: 'user-001', storeKey: 'akiba', status: 'visited' })
      } as never
    })
    const result = await evaluateVisit(ctx, { storeKey: 'akiba' })
    expect(result).toBe(true)
  })

  test('returns false when UserStore row does not exist', async () => {
    const ctx = makeCtx({
      userStore: {
        findFirst: async () => null
      } as never
    })
    const result = await evaluateVisit(ctx, { storeKey: 'akiba' })
    expect(result).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// evaluateAreaAny
// ---------------------------------------------------------------------------

describe('evaluateAreaAny', () => {
  test('returns true when at least 1 store in area is visited', async () => {
    const ctx = makeCtx({
      userStore: {
        count: async () => 1
      } as never
    })
    const result = await evaluateAreaAny(ctx, { region: 'hokkaido' })
    expect(result).toBe(true)
  })

  test('returns false when 0 stores in area are visited', async () => {
    const ctx = makeCtx({
      userStore: {
        count: async () => 0
      } as never
    })
    const result = await evaluateAreaAny(ctx, { region: 'hokkaido' })
    expect(result).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// evaluateAreaComplete
// ---------------------------------------------------------------------------

describe('evaluateAreaComplete', () => {
  test('returns true when all stores in the area are visited', async () => {
    // hokkaido has 1 store (sapporo)
    const hokkaidoStores = PHYSICAL_STORE_KEYS.filter((k) => storeKeyToBadgeArea[k] === 'hokkaido')
    const ctx = makeCtx({
      userStore: {
        count: async () => hokkaidoStores.length
      } as never
    })
    const result = await evaluateAreaComplete(ctx, { region: 'hokkaido' })
    expect(result).toBe(true)
  })

  test('returns false when one store is missing', async () => {
    const hokkaidoStores = PHYSICAL_STORE_KEYS.filter((k) => storeKeyToBadgeArea[k] === 'hokkaido')
    const ctx = makeCtx({
      userStore: {
        count: async () => Math.max(0, hokkaidoStores.length - 1)
      } as never
    })
    const result = await evaluateAreaComplete(ctx, { region: 'hokkaido' })
    expect(result).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// evaluateCount
// ---------------------------------------------------------------------------

describe('evaluateCount', () => {
  test.each([
    [9, 10, false],
    [10, 10, true],
    [11, 10, true]
  ] as const)('count=%i threshold=%i → %s', async (visitedCount, threshold, expected) => {
    const ctx = makeCtx({
      userStore: {
        count: async () => visitedCount
      } as never
    })
    const result = await evaluateCount(ctx, { count: threshold })
    expect(result).toBe(expected)
  })
})

// ---------------------------------------------------------------------------
// evaluateEventCount
// ---------------------------------------------------------------------------

describe('evaluateEventCount', () => {
  test('returns true when completed event count meets threshold', async () => {
    const ctx = makeCtx({
      userEvent: {
        count: async () => 10
      } as never
    })
    const result = await evaluateEventCount(ctx, { count: 10 })
    expect(result).toBe(true)
  })

  test('returns false when completed event count is below threshold', async () => {
    const ctx = makeCtx({
      userEvent: {
        count: async () => 4
      } as never
    })
    const result = await evaluateEventCount(ctx, { count: 5 })
    expect(result).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// evaluateEventClearAtStore
// ---------------------------------------------------------------------------

describe('evaluateEventClearAtStore', () => {
  test('returns true when a completed event exists for the store', async () => {
    const ctx = makeCtx({
      userEvent: {
        findFirst: async () => ({ id: 'ue-1' })
      } as never
    })
    const result = await evaluateEventClearAtStore(ctx, { storeKey: 'akiba' })
    expect(result).toBe(true)
  })

  test('returns false when no completed event exists for the store', async () => {
    const ctx = makeCtx({
      userEvent: {
        findFirst: async () => null
      } as never
    })
    const result = await evaluateEventClearAtStore(ctx, { storeKey: 'akiba' })
    expect(result).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// evaluateEventClearAreaAny
// ---------------------------------------------------------------------------

describe('evaluateEventClearAreaAny', () => {
  test('returns true when any store in area has a completed event', async () => {
    const ctx = makeCtx({
      userEvent: {
        findFirst: async () => ({ id: 'ue-1' })
      } as never
    })
    const result = await evaluateEventClearAreaAny(ctx, { region: 'hokkaido' })
    expect(result).toBe(true)
  })

  test('returns false when no store in area has a completed event', async () => {
    const ctx = makeCtx({
      userEvent: {
        findFirst: async () => null
      } as never
    })
    const result = await evaluateEventClearAreaAny(ctx, { region: 'hokkaido' })
    expect(result).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// evaluateEventClearAreaComplete
// ---------------------------------------------------------------------------

describe('evaluateEventClearAreaComplete', () => {
  test('returns true when all stores in area have a completed event', async () => {
    // All findFirst calls return a row
    const ctx = makeCtx({
      userEvent: {
        findFirst: async () => ({ id: 'ue-1' })
      } as never
    })
    const result = await evaluateEventClearAreaComplete(ctx, { region: 'hokkaido' })
    expect(result).toBe(true)
  })

  test('returns false when at least one store in area has no completed event', async () => {
    const ctx = makeCtx({
      userEvent: {
        findFirst: async () => {
          // hokkaido has 1 store (sapporo), always returns null → area not complete
          return null
        }
      } as never
    })
    const result = await evaluateEventClearAreaComplete(ctx, { region: 'hokkaido' })
    expect(result).toBe(false)
  })

  test('multi-store area: returns false when second store is missing', async () => {
    // ikebukuro has multiple stores
    const ikebukuroStores = PHYSICAL_STORE_KEYS.filter((k) => storeKeyToBadgeArea[k] === 'ikebukuro')
    expect(ikebukuroStores.length).toBeGreaterThan(1)

    let callCount = 0
    const ctx = makeCtx({
      userEvent: {
        findFirst: async () => {
          callCount++
          // Only the first store succeeds; the rest fail
          return callCount === 1 ? { id: 'ue-1' } : null
        }
      } as never
    })
    const result = await evaluateEventClearAreaComplete(ctx, { region: 'ikebukuro' })
    expect(result).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// evaluateEventClearCount
// ---------------------------------------------------------------------------

describe('evaluateEventClearCount', () => {
  const makeCtxWithStores = (storeKeys: StoreKey[]) =>
    makeCtx({
      userEvent: {
        findMany: async () =>
          storeKeys.map((sk) => ({
            event: {
              stores: [{ storeKey: sk }]
            }
          }))
      } as never
    })

  test('returns true when distinct cleared store count meets threshold', async () => {
    // Use 5 distinct stores
    const stores = PHYSICAL_STORE_KEYS.slice(0, 5) as StoreKey[]
    const ctx = makeCtxWithStores(stores)
    const result = await evaluateEventClearCount(ctx, { count: 5 })
    expect(result).toBe(true)
  })

  test('returns false when distinct cleared store count is below threshold', async () => {
    const stores = PHYSICAL_STORE_KEYS.slice(0, 4) as StoreKey[]
    const ctx = makeCtxWithStores(stores)
    const result = await evaluateEventClearCount(ctx, { count: 5 })
    expect(result).toBe(false)
  })

  test('deduplicates stores across multiple events', async () => {
    // Same store appears twice → still counts as 1
    const stores = [PHYSICAL_STORE_KEYS[0] as StoreKey, PHYSICAL_STORE_KEYS[0] as StoreKey]
    const ctx = makeCtxWithStores(stores)
    const result = await evaluateEventClearCount(ctx, { count: 2 })
    expect(result).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// evaluateEventClearAll
// ---------------------------------------------------------------------------

describe('evaluateEventClearAll', () => {
  test('returns true when all physical stores have a cleared event', async () => {
    const allStores = PHYSICAL_STORE_KEYS as readonly StoreKey[]
    const ctx = makeCtx({
      userEvent: {
        findMany: async () =>
          allStores.map((sk) => ({
            event: {
              stores: [{ storeKey: sk }]
            }
          }))
      } as never
    })
    const result = await evaluateEventClearAll(ctx)
    expect(result).toBe(true)
  })

  test('returns false when one store is missing', async () => {
    const allButOne = PHYSICAL_STORE_KEYS.slice(0, -1) as StoreKey[]
    const ctx = makeCtx({
      userEvent: {
        findMany: async () =>
          allButOne.map((sk) => ({
            event: {
              stores: [{ storeKey: sk }]
            }
          }))
      } as never
    })
    const result = await evaluateEventClearAll(ctx)
    expect(result).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// evaluateVoteTotal
// ---------------------------------------------------------------------------

describe('evaluateVoteTotal', () => {
  test.each([
    [9, 10, false],
    [10, 10, true],
    [500, 500, true]
  ] as const)('vote count=%i threshold=%i → %s', async (voteCount, threshold, expected) => {
    const ctx = makeCtx({
      vote: {
        count: async () => voteCount
      } as never
    })
    const result = await evaluateVoteTotal(ctx, { count: threshold })
    expect(result).toBe(expected)
  })
})

// ---------------------------------------------------------------------------
// evaluateVoteUnique
// ---------------------------------------------------------------------------

describe('evaluateVoteUnique', () => {
  test('returns true when distinct character count meets threshold', async () => {
    // groupBy returns one entry per distinct character
    const ctx = makeCtx({
      vote: {
        groupBy: async () => [{ characterId: 'char-1' }, { characterId: 'char-2' }, { characterId: 'char-3' }]
      } as never
    })
    const result = await evaluateVoteUnique(ctx, { count: 3 })
    expect(result).toBe(true)
  })

  test('returns false when distinct character count is below threshold', async () => {
    const ctx = makeCtx({
      vote: {
        groupBy: async () => [{ characterId: 'char-1' }, { characterId: 'char-2' }]
      } as never
    })
    const result = await evaluateVoteUnique(ctx, { count: 3 })
    expect(result).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// evaluateVoteDevotion
// ---------------------------------------------------------------------------

describe('evaluateVoteDevotion', () => {
  test('returns true when max single-character votes meets threshold', async () => {
    const ctx = makeCtx({
      vote: {
        groupBy: async () => [{ characterId: 'char-1', _count: { characterId: 10 } }]
      } as never
    })
    const result = await evaluateVoteDevotion(ctx, { count: 10 })
    expect(result).toBe(true)
  })

  test('returns false when max single-character votes is below threshold', async () => {
    const ctx = makeCtx({
      vote: {
        groupBy: async () => [{ characterId: 'char-1', _count: { characterId: 9 } }]
      } as never
    })
    const result = await evaluateVoteDevotion(ctx, { count: 10 })
    expect(result).toBe(false)
  })

  test('returns false when no votes exist', async () => {
    const ctx = makeCtx({
      vote: {
        groupBy: async () => []
      } as never
    })
    const result = await evaluateVoteDevotion(ctx, { count: 1 })
    expect(result).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// evaluateVoteAllBiccame
// ---------------------------------------------------------------------------

describe('evaluateVoteAllBiccame', () => {
  test('returns true when all biccame musume characters have been voted for', async () => {
    // The module uses BICCAME_MUSUME_IDS from characters.json.
    // We mock groupBy to return the same number of rows as the set size.
    // Since we can't easily access BICCAME_MUSUME_IDS directly, we test using a
    // large enough count that satisfies any reasonable set size.
    // This test verifies the comparison logic rather than the exact set.
    //
    // Strategy: mock groupBy to return rows equal to what the code compares against.
    // We import the evaluator and let it use the real BICCAME_MUSUME_IDS — we just
    // need to ensure the voted count equals BICCAME_MUSUME_IDS.size.

    // Import characters.json directly to know the expected count
    const chars = (await import('../../public/characters.json')).default as Array<{
      id: string
      character: { is_biccame_musume?: boolean }
    }>
    const biccameCount = chars.filter((c) => c.character.is_biccame_musume === true).length

    const ctx = makeCtx({
      vote: {
        groupBy: async () => Array.from({ length: biccameCount }, (_, i) => ({ characterId: `char-${i}` }))
      } as never
    })
    const result = await evaluateVoteAllBiccame(ctx)
    expect(result).toBe(true)
  })

  test('returns false when some biccame musume characters have not been voted for', async () => {
    const ctx = makeCtx({
      vote: {
        groupBy: async () => [{ characterId: 'char-1' }] // only 1 character
      } as never
    })
    const result = await evaluateVoteAllBiccame(ctx)
    expect(result).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// evaluateSpecialMultiStoreClear
// ---------------------------------------------------------------------------

describe('evaluateSpecialMultiStoreClear', () => {
  test('returns true when all specified stores have a cleared event', async () => {
    const ctx = makeCtx({
      userEvent: {
        findFirst: async () => ({ id: 'ue-1' })
      } as never
    })
    const result = await evaluateSpecialMultiStoreClear(ctx, { storeKeys: ['akiba', 'sapporo'] })
    expect(result).toBe(true)
  })

  test('returns false when any specified store has no cleared event', async () => {
    let callCount = 0
    const ctx = makeCtx({
      userEvent: {
        findFirst: async () => {
          callCount++
          return callCount === 1 ? { id: 'ue-1' } : null
        }
      } as never
    })
    const result = await evaluateSpecialMultiStoreClear(ctx, { storeKeys: ['akiba', 'sapporo'] })
    expect(result).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// evaluateSpecialEventId
// ---------------------------------------------------------------------------

describe('evaluateSpecialEventId', () => {
  test('returns true when user has completed the specified event', async () => {
    const ctx = makeCtx({
      userEvent: {
        findFirst: async () => ({ id: 'ue-1' })
      } as never
    })
    const result = await evaluateSpecialEventId(ctx, { eventId: 'event-xyz' })
    expect(result).toBe(true)
  })

  test('returns false when user has not completed the event', async () => {
    const ctx = makeCtx({
      userEvent: {
        findFirst: async () => null
      } as never
    })
    const result = await evaluateSpecialEventId(ctx, { eventId: 'event-xyz' })
    expect(result).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// evaluateBadge dispatcher
// ---------------------------------------------------------------------------

function makeBadge(subCategory: BadgeSubCategory, meta: BadgeConditionMeta): Badge {
  return {
    code: `test_${subCategory}`,
    category: 'store',
    subCategory,
    name: 'Test Badge',
    description: 'Test',
    hint: 'Test',
    rarity: 'common',
    iconName: 'Star',
    sortOrder: 0,
    conditionMeta: JSON.stringify(meta),
    isHidden: false,
    createdAt: new Date(),
    updatedAt: new Date()
  }
}

describe('evaluateBadge dispatcher', () => {
  test('dispatches visit subCategory', async () => {
    const ctx = makeCtx({
      userStore: {
        findFirst: async () => ({ id: 'row-1' })
      } as never
    })
    const badge = makeBadge('visit', { storeKey: 'akiba' })
    const result = await evaluateBadge(ctx, badge)
    expect(result).toBe(true)
  })

  test('dispatches count subCategory', async () => {
    const ctx = makeCtx({
      userStore: {
        count: async () => 10
      } as never
    })
    const badge = makeBadge('count', { count: 10 })
    const result = await evaluateBadge(ctx, badge)
    expect(result).toBe(true)
  })

  test('dispatches vote_total subCategory', async () => {
    const ctx = makeCtx({
      vote: {
        count: async () => 5
      } as never
    })
    const badge = makeBadge('vote_total', { count: 5 })
    const result = await evaluateBadge(ctx, badge)
    expect(result).toBe(true)
  })

  test('throws when visit badge is missing storeKey', async () => {
    const ctx = makeCtx({})
    const badge = makeBadge('visit', {})
    expect(evaluateBadge(ctx, badge)).rejects.toThrow('missing storeKey')
  })

  test('throws when area_any badge is missing region', async () => {
    const ctx = makeCtx({})
    const badge = makeBadge('area_any', {})
    expect(evaluateBadge(ctx, badge)).rejects.toThrow('missing region')
  })

  test('throws when count badge is missing count', async () => {
    const ctx = makeCtx({})
    const badge = makeBadge('count', {})
    expect(evaluateBadge(ctx, badge)).rejects.toThrow('missing count')
  })

  test('throws when special_multi_store_clear badge is missing storeKeys', async () => {
    const ctx = makeCtx({})
    const badge = makeBadge('special_multi_store_clear', {})
    expect(evaluateBadge(ctx, badge)).rejects.toThrow('missing storeKeys')
  })

  test('throws when special_event_id badge is missing eventId', async () => {
    const ctx = makeCtx({})
    const badge = makeBadge('special_event_id', {})
    expect(evaluateBadge(ctx, badge)).rejects.toThrow('missing eventId')
  })
})
