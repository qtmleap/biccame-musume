import { describe, expect, test } from 'bun:test'
import type { PrismaClient } from '@prisma/client'
import {
  type EvaluatorContext,
  evaluateAllUsersBadges,
  evaluateAndAwardBadges,
  evaluateOnEventComplete,
  evaluateOnVisit,
  evaluateOnVote
} from '../../src/services/badge'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type BadgeRow = {
  code: string
  subCategory: string
  conditionMeta: string
  isHidden?: boolean
  category?: string
  name?: string
  description?: string
  hint?: string
  rarity?: string
  iconName?: string
  sortOrder?: number
  createdAt?: Date
  updatedAt?: Date
}

function fullBadge(row: BadgeRow): BadgeRow & Required<Pick<BadgeRow, 'createdAt' | 'updatedAt'>> {
  return {
    isHidden: false,
    category: 'test',
    name: row.code,
    description: '',
    hint: '',
    rarity: 'common',
    iconName: 'Star',
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...row
  }
}

/**
 * `evaluateAndAwardBadges` の内部が要求する prisma メソッドを最小限まかなうモック。
 * badge.findMany は candidateCodes を渡された場合の絞り込みも再現する。
 */
function makeCtx(opts: {
  allBadges: BadgeRow[]
  earned?: string[]
  visited?: string[]
  completedEvents?: { eventId: string; storeKeys: string[] }[]
  voteTotal?: number
  onCreate?: (code: string) => void
  eventStores?: string[]
}): EvaluatorContext {
  const badges = opts.allBadges.map(fullBadge)
  return {
    env: {} as never,
    userId: 'user-001',
    prisma: {
      userBadge: {
        findMany: async () => (opts.earned ?? []).map((c) => ({ badgeCode: c })),
        create: async ({ data }: { data: { badgeCode: string } }) => {
          opts.onCreate?.(data.badgeCode)
          return { id: 'x' }
        }
      },
      badge: {
        findMany: async (args?: { where?: { code?: { in?: string[] } }; select?: unknown }) => {
          const candidateCodes = args?.where?.code?.in
          const filtered = candidateCodes ? badges.filter((b) => candidateCodes.includes(b.code)) : badges
          // hooks (evaluateOn*) は select 指定で code/subCategory/conditionMeta だけ引くが、
          // モックとしては同じ shape を返してしまう。実装が余分な field を読まなければ問題ない。
          return filtered
        }
      },
      eventStore: {
        findMany: async () => (opts.eventStores ?? []).map((sk) => ({ storeKey: sk }))
      },
      userStore: {
        findMany: async () => (opts.visited ?? []).map((sk) => ({ storeKey: sk }))
      },
      userEvent: {
        findMany: async () =>
          (opts.completedEvents ?? []).map((ce) => ({
            eventId: ce.eventId,
            event: { stores: ce.storeKeys.map((sk) => ({ storeKey: sk })) }
          }))
      },
      vote: { count: async () => opts.voteTotal ?? 0 }
    } as unknown as PrismaClient
  }
}

// ---------------------------------------------------------------------------
// evaluateOnVisit — 訪問トリガーが candidate を正しく絞る
// ---------------------------------------------------------------------------

describe('evaluateOnVisit narrows candidates by store/area/milestone', () => {
  const allBadges: BadgeRow[] = [
    { code: 'store_visit_akiba', subCategory: 'visit', conditionMeta: '{"storeKey":"akiba"}' },
    { code: 'store_visit_shinjyuku', subCategory: 'visit', conditionMeta: '{"storeKey":"shinjyuku"}' },
    { code: 'area_any_ikebukuro', subCategory: 'area_any', conditionMeta: '{"region":"ikebukuro"}' },
    {
      code: 'area_any_shinjuku_shibuya',
      subCategory: 'area_any',
      conditionMeta: '{"region":"shinjuku_shibuya"}'
    },
    {
      code: 'area_complete_shinjuku_shibuya',
      subCategory: 'area_complete',
      conditionMeta: '{"region":"shinjuku_shibuya"}'
    },
    { code: 'milestone_visit_count_5', subCategory: 'count', conditionMeta: '{"count":5}' },
    { code: 'milestone_visit_areas', subCategory: 'all_areas_any_visit', conditionMeta: '{}' },
    // 別ドメインのバッジ — visit トリガーでは対象外
    { code: 'event_count_1', subCategory: 'event_count', conditionMeta: '{"count":1}' },
    { code: 'vote_total_1', subCategory: 'vote_total', conditionMeta: '{"count":1}' }
  ]

  test('shinjyuku を visit すると shinjyuku 用の visit / area / milestone だけが付与対象になる', async () => {
    const created: string[] = []
    const ctx = makeCtx({
      allBadges,
      visited: ['shinjyuku'],
      onCreate: (c) => created.push(c)
    })
    const awarded = await evaluateOnVisit(ctx, 'shinjyuku')
    const codes = awarded.map((b) => b.code).sort()
    // visit / area_any / area_complete (単店エリアなので shinjyuku_shibuya は現役全店ではなく複数店だから complete は false 想定だが、
    // 実際の shinjuku_shibuya は複数店なので complete は false。any は true。
    // milestone_visit_count_5 は count=1 で 5 未満なので false。
    // milestone_visit_areas は全エリア >= 1 が必要 — 1 エリアしか visited でないので false。
    // 期待付与: store_visit_shinjyuku, area_any_shinjuku_shibuya
    expect(codes).toContain('store_visit_shinjyuku')
    expect(codes).toContain('area_any_shinjuku_shibuya')
    // 他ドメインは絞り込みで最初から除外
    expect(codes).not.toContain('event_count_1')
    expect(codes).not.toContain('vote_total_1')
    // 別店舗の visit / 別エリアも当然対象外
    expect(codes).not.toContain('store_visit_akiba')
    expect(codes).not.toContain('area_any_ikebukuro')
  })
})

// ---------------------------------------------------------------------------
// evaluateOnEventComplete — event candidate 絞り込み + 毒バッジ隔離
// ---------------------------------------------------------------------------

describe('evaluateOnEventComplete filters and tolerates poisoned meta', () => {
  test('壊れた conditionMeta のバッジがあっても、他バッジの評価が止まらない', async () => {
    // special_event_id なのに eventId 欠損の毒バッジ
    // special_multi_store_clear なのに storeKeys 欠損の毒バッジ
    // event_count 系の正常バッジ
    const created: string[] = []
    const ctx = makeCtx({
      allBadges: [
        {
          code: 'poison_event_id',
          subCategory: 'special_event_id',
          conditionMeta: '{"storeKeys":["akiba"]}' // eventId 無し
        },
        {
          code: 'poison_multi_store',
          subCategory: 'special_multi_store_clear',
          conditionMeta: '{"eventId":"ev-x"}' // storeKeys 無し
        },
        {
          code: 'event_count_1',
          subCategory: 'event_count',
          conditionMeta: '{"count":1}'
        }
      ],
      completedEvents: [{ eventId: 'ev-1', storeKeys: ['akiba'] }],
      eventStores: ['akiba'],
      onCreate: (c) => created.push(c)
    })
    const awarded = await evaluateOnEventComplete(ctx, 'ev-1')
    const codes = awarded.map((b) => b.code)
    // event_count_1 は付与される（completedEventCount=1 >= 1）
    expect(codes).toContain('event_count_1')
    // 毒バッジは candidate 選定段階で除外され、awarded にも入らない
    expect(codes).not.toContain('poison_event_id')
    expect(codes).not.toContain('poison_multi_store')
  })

  test('special_event_id は eventId 一致でだけ candidate に入る', async () => {
    const created: string[] = []
    const ctx = makeCtx({
      allBadges: [
        {
          code: 'special_target',
          subCategory: 'special_event_id',
          conditionMeta: '{"eventId":"ev-target"}'
        },
        {
          code: 'special_other',
          subCategory: 'special_event_id',
          conditionMeta: '{"eventId":"ev-other"}'
        }
      ],
      completedEvents: [{ eventId: 'ev-target', storeKeys: [] }],
      eventStores: [],
      onCreate: (c) => created.push(c)
    })
    const awarded = await evaluateOnEventComplete(ctx, 'ev-target')
    const codes = awarded.map((b) => b.code)
    expect(codes).toContain('special_target')
    expect(codes).not.toContain('special_other')
  })
})

// ---------------------------------------------------------------------------
// evaluateOnVote — vote_total のみに絞る
// ---------------------------------------------------------------------------

describe('evaluateOnVote only considers vote_total', () => {
  test('vote_total 以外の subCategory は candidate に入らない', async () => {
    const created: string[] = []
    const ctx = makeCtx({
      allBadges: [
        { code: 'vote_total_1', subCategory: 'vote_total', conditionMeta: '{"count":1}' },
        { code: 'store_visit_akiba', subCategory: 'visit', conditionMeta: '{"storeKey":"akiba"}' }
      ],
      voteTotal: 1,
      visited: ['akiba'],
      onCreate: (c) => created.push(c)
    })
    const awarded = await evaluateOnVote(ctx, 'character-x')
    const codes = awarded.map((b) => b.code)
    expect(codes).toContain('vote_total_1')
    expect(codes).not.toContain('store_visit_akiba')
  })
})

// ---------------------------------------------------------------------------
// evaluateAndAwardBadges: candidateCodes に無いバッジは触れない (毒隔離の一部)
// ---------------------------------------------------------------------------

describe('evaluateAndAwardBadges scope is limited to candidateCodes', () => {
  test('candidateCodes を指定すると badge.findMany の where に code.in が渡る', async () => {
    let capturedWhere: unknown
    const ctx: EvaluatorContext = {
      env: {} as never,
      userId: 'user-001',
      prisma: {
        userBadge: {
          findMany: async () => [],
          create: async () => ({ id: 'x' })
        },
        badge: {
          findMany: async (args?: { where?: unknown }) => {
            capturedWhere = args?.where
            return [
              {
                code: 'store_visit_akiba',
                subCategory: 'visit',
                conditionMeta: '{"storeKey":"akiba"}',
                isHidden: false,
                category: 'store',
                name: 'x',
                description: '',
                hint: '',
                rarity: 'common',
                iconName: 'MapPin',
                sortOrder: 1,
                createdAt: new Date(),
                updatedAt: new Date()
              }
            ]
          }
        },
        userStore: { findMany: async () => [{ storeKey: 'akiba' }] },
        userEvent: { findMany: async () => [] },
        vote: { count: async () => 0 }
      } as unknown as PrismaClient
    }
    await evaluateAndAwardBadges(ctx, ['store_visit_akiba'])
    expect(capturedWhere).toEqual({ code: { in: ['store_visit_akiba'] } })
  })

  test('candidateCodes 未指定なら where は undefined（全 badge 対象、earned は JS 側で除外）', async () => {
    let capturedWhere: unknown = 'sentinel'
    const ctx: EvaluatorContext = {
      env: {} as never,
      userId: 'user-001',
      prisma: {
        userBadge: {
          findMany: async () => [],
          create: async () => ({ id: 'x' })
        },
        badge: {
          findMany: async (args?: { where?: unknown }) => {
            capturedWhere = args?.where
            return []
          }
        },
        userStore: { findMany: async () => [] },
        userEvent: { findMany: async () => [] },
        vote: { count: async () => 0 }
      } as unknown as PrismaClient
    }
    await evaluateAndAwardBadges(ctx)
    expect(capturedWhere).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// evaluateAllUsersBadges: since フィルタと per-user catch
// ---------------------------------------------------------------------------

describe('evaluateAllUsersBadges', () => {
  test('since 未指定なら user.findMany の where は undefined（全ユーザー対象）', async () => {
    let capturedWhere: unknown = 'sentinel'
    const prisma = {
      user: {
        findMany: async (args?: { where?: unknown }) => {
          capturedWhere = args?.where
          return []
        }
      }
    } as unknown as PrismaClient
    await evaluateAllUsersBadges({} as never, prisma)
    expect(capturedWhere).toBeUndefined()
  })

  test('since 指定なら stores/events の updatedAt >= since を OR で入れる', async () => {
    let capturedWhere: Record<string, unknown> | undefined
    const since = new Date('2026-07-22T00:00:00.000Z')
    const prisma = {
      user: {
        findMany: async (args?: { where?: Record<string, unknown> }) => {
          capturedWhere = args?.where
          return []
        }
      }
    } as unknown as PrismaClient
    await evaluateAllUsersBadges({} as never, prisma, 25, { since })
    expect(capturedWhere).toBeDefined()
    // OR に 2 つの条件（stores.some / events.some）が入る想定
    const or = capturedWhere?.OR as { stores?: unknown; events?: unknown }[] | undefined
    expect(Array.isArray(or)).toBe(true)
    expect(or?.length).toBe(2)
    // stores 条件は { stores: { some: { updatedAt: { gte: since } } } }
    expect(or?.[0]).toEqual({ stores: { some: { updatedAt: { gte: since } } } })
    expect(or?.[1]).toEqual({ events: { some: { updatedAt: { gte: since } } } })
  })

  test('1 ユーザーの評価失敗が chunk を落とさない — 他ユーザーは通常通り処理される', async () => {
    // 2 人のユーザー: user-fail は評価で throw、user-ok は通常成功
    let evaluatedForOk = false
    const prisma = {
      user: {
        findMany: async () => [{ id: 'user-fail' }, { id: 'user-ok' }]
      },
      userBadge: {
        findMany: async (args: { where: { userId: string } }) => {
          if (args.where.userId === 'user-fail') {
            throw new Error('simulated DB failure for user-fail')
          }
          evaluatedForOk = true
          return []
        },
        create: async () => ({ id: 'x' })
      },
      badge: { findMany: async () => [] },
      userStore: { findMany: async () => [] },
      userEvent: { findMany: async () => [] },
      vote: { count: async () => 0 }
    } as unknown as PrismaClient

    const { processedUsers, totalAwarded } = await evaluateAllUsersBadges({} as never, prisma)
    // 全体の processedUsers は 2、totalAwarded は 0
    expect(processedUsers).toBe(2)
    expect(totalAwarded).toBe(0)
    // user-ok は評価まで到達している
    expect(evaluatedForOk).toBe(true)
  })
})
