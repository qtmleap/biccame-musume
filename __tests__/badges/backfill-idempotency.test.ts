import { describe, expect, test } from 'bun:test'
import type { PrismaClient } from '@prisma/client'
import { type EvaluatorContext, evaluateAndAwardBadges } from '../../src/services/badge-evaluator'

/**
 * Backfill idempotency tests.
 *
 * The implementation in evaluateAndAwardBadges uses:
 *
 *   await ctx.prisma.userBadge.create({ data: { userId, badgeCode } })
 *
 * wrapped in a try/catch that silently swallows the error on UNIQUE violation.
 * The Prisma schema enforces @@unique([userId, badgeCode]) on user_badges,
 * so a second create for the same (userId, badgeCode) pair throws a
 * PrismaClientKnownRequestError (P2002). The catch block absorbs that, meaning
 * a second backfill run is a no-op for already-earned badges.
 *
 * These tests verify that behaviour using a mocked PrismaClient:
 *   1. First call: create succeeds → badge is returned as newly earned.
 *   2. Second call: create throws → error is swallowed → empty array returned.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUniqueError(): Error {
  const err = new Error('Unique constraint failed') as Error & { code?: string }
  err.code = 'P2002'
  return err
}

type CreateFn = (args: { data: { userId: string; badgeCode: string } }) => Promise<{ id: string }>

const ALL_BADGES = [
  {
    code: 'store_visit_akiba',
    subCategory: 'visit',
    conditionMeta: JSON.stringify({ storeKey: 'akiba' }),
    isHidden: false,
    category: 'store',
    name: 'AKIBA店訪問',
    description: 'test',
    hint: 'test',
    rarity: 'common',
    iconName: 'MapPin',
    sortOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date()
  }
]

/** Build a minimal PrismaClient mock that tracks create calls. */
function makeIdempotencyCtx(opts: { initialEarned: string[]; createShouldThrow: boolean }): {
  ctx: EvaluatorContext
  createCalls: string[]
} {
  const createCalls: string[] = []

  const createFn: CreateFn = async ({ data }) => {
    createCalls.push(data.badgeCode)
    if (opts.createShouldThrow) throw makeUniqueError()
    return { id: 'new-id' }
  }

  const ctx: EvaluatorContext = {
    env: {} as never,
    userId: 'user-001',
    prisma: {
      userBadge: {
        findMany: async () => opts.initialEarned.map((code) => ({ badgeCode: code })),
        create: createFn
      },
      badge: {
        // Simulate the DB-level filter: exclude codes already in earnedSet.
        findMany: async (args?: { where?: { NOT?: { code?: { in?: string[] } } } }) => {
          const excludedCodes: string[] = args?.where?.NOT?.code?.in ?? []
          return ALL_BADGES.filter((b) => !excludedCodes.includes(b.code))
        }
      },
      userStore: {
        findFirst: async () => ({ id: 'row-1', status: 'visited' })
      }
    } as unknown as PrismaClient
  }

  return { ctx, createCalls }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('backfill idempotency', () => {
  test('first run awards the badge and returns it', async () => {
    const { ctx } = makeIdempotencyCtx({ initialEarned: [], createShouldThrow: false })
    const newBadges = await evaluateAndAwardBadges(ctx)
    expect(newBadges).toHaveLength(1)
    expect(newBadges[0]?.code).toBe('store_visit_akiba')
  })

  test('second run swallows UNIQUE violation and returns empty array', async () => {
    // Simulate second run: badge is already earned AND the create throws.
    // The code first checks earnedSet, so already-earned badges are filtered out
    // before even calling evaluateBadge. Test both paths:
    //
    //   Path A: badge is in the earned set → skipped at query time (findMany filters it).
    //   Path B: concurrent insert — badge not in earned set but create throws.

    // Path A: already in earnedSet
    const { ctx: ctxA } = makeIdempotencyCtx({
      initialEarned: ['store_visit_akiba'],
      createShouldThrow: false
    })
    const resultA = await evaluateAndAwardBadges(ctxA)
    expect(resultA).toHaveLength(0)
  })

  test('concurrent insert (UNIQUE violation from DB) is silently swallowed', async () => {
    // Path B: badge not in earnedSet but create throws P2002
    const { ctx: ctxB, createCalls } = makeIdempotencyCtx({
      initialEarned: [],
      createShouldThrow: true
    })
    // Should NOT throw — the catch block swallows it.
    const resultB = await evaluateAndAwardBadges(ctxB)
    expect(resultB).toHaveLength(0) // Badge not added to newBadges on error
    expect(createCalls).toHaveLength(1) // create was attempted
  })

  test('running evaluateAndAwardBadges twice does not double-insert', async () => {
    // Simulate two sequential backfill runs against the same "DB":
    // Run 1: earned set is empty → badge is awarded and stored.
    // Run 2: earned set now contains the badge → badge is skipped entirely.
    const awarded: string[] = []

    const ctx: EvaluatorContext = {
      env: {} as never,
      userId: 'user-001',
      prisma: {
        userBadge: {
          findMany: async () => awarded.map((code) => ({ badgeCode: code })),
          create: async ({ data }: { data: { userId: string; badgeCode: string } }) => {
            if (awarded.includes(data.badgeCode)) throw makeUniqueError()
            awarded.push(data.badgeCode)
            return { id: 'new-id' }
          }
        },
        badge: {
          findMany: async (args?: { where?: { NOT?: { code?: { in?: string[] } } } }) => {
            const excludedCodes: string[] = args?.where?.NOT?.code?.in ?? []
            return ALL_BADGES.filter((b) => !excludedCodes.includes(b.code))
          }
        },
        userStore: {
          findFirst: async () => ({ id: 'row-1', status: 'visited' })
        }
      } as unknown as PrismaClient
    }

    const run1 = await evaluateAndAwardBadges(ctx)
    const run2 = await evaluateAndAwardBadges(ctx)

    expect(run1).toHaveLength(1)
    expect(run2).toHaveLength(0)
    expect(awarded).toHaveLength(1) // Only one insert total
  })
})
