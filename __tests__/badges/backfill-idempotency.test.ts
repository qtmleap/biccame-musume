import { describe, expect, test } from 'bun:test'
import { Prisma, type PrismaClient } from '@prisma/client'
import { type EvaluatorContext, evaluateAndAwardBadges } from '../../src/services/badge'

/**
 * Backfill idempotency tests.
 *
 * The implementation in evaluateAndAwardBadges uses:
 *
 *   await ctx.prisma.userBadge.create({ data: { userId, badgeCode } })
 *
 * wrapped in a try/catch that silently swallows PrismaClientKnownRequestError
 * with code P2002 (UNIQUE violation). The Prisma schema enforces
 * @@unique([userId, badgeCode]) on user_badges, so a second create for the same
 * (userId, badgeCode) pair throws P2002. The catch block absorbs that, meaning
 * a second backfill run is a no-op for already-earned badges.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUniqueError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test'
  })
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

/**
 * Build a minimal PrismaClient mock that tracks create calls.
 * Snapshot 実装対応:
 *   - badge.findMany は earned の除外を JS 側で行うので where フィルタは無視して全件返す
 *   - snapshot 用に userStore/userEvent の findMany と vote.count を提供
 */
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
        findMany: async () => ALL_BADGES
      },
      // snapshot 用: 訪問済み storeKey は akiba のみ → store_visit_akiba を条件成立させる
      userStore: {
        findMany: async () => [{ storeKey: 'akiba' }]
      },
      userEvent: {
        findMany: async () => []
      },
      vote: {
        count: async () => 0
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
    // Path A: already in earnedSet → filtered out at JS side
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
    // Should NOT throw — the catch block swallows P2002.
    const resultB = await evaluateAndAwardBadges(ctxB)
    expect(resultB).toHaveLength(0)
    expect(createCalls).toHaveLength(1)
  })

  test('running evaluateAndAwardBadges twice does not double-insert', async () => {
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
          findMany: async () => ALL_BADGES
        },
        userStore: {
          findMany: async () => [{ storeKey: 'akiba' }]
        },
        userEvent: {
          findMany: async () => []
        },
        vote: {
          count: async () => 0
        }
      } as unknown as PrismaClient
    }

    const run1 = await evaluateAndAwardBadges(ctx)
    const run2 = await evaluateAndAwardBadges(ctx)

    expect(run1).toHaveLength(1)
    expect(run2).toHaveLength(0)
    expect(awarded).toHaveLength(1)
  })
})
