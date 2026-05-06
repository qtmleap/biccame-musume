import type { Badge, PrismaClient } from '@prisma/client'
import type { BadgeArea } from '@/data/badges/area-mapping'
import { storeKeyToBadgeArea } from '@/data/badges/area-mapping'
import type { BadgeConditionMeta, BadgeSubCategory } from '@/data/badges/registry'
import { PHYSICAL_STORE_KEYS } from '@/data/badges/store-exclusion'
import type { StoreKey } from '@/schemas/store.dto'
import type { Bindings } from '@/types/bindings'

// IDs of all characters with is_biccame_musume=true, read from public/characters.json at module load.
// This avoids a runtime FS read inside each request.
import CHARACTERS_JSON from '../../public/characters.json' with { type: 'json' }

const BICCAME_MUSUME_IDS: ReadonlySet<string> = new Set(
  (CHARACTERS_JSON as Array<{ id: string; character: { is_biccame_musume?: boolean } }>)
    .filter((c) => c.character.is_biccame_musume === true)
    .map((c) => c.id)
)

export type EvaluatorContext = {
  env: Bindings
  prisma: PrismaClient
  userId: string
}

// ---------------------------------------------------------------------------
// Individual evaluators
// ---------------------------------------------------------------------------

export async function evaluateVisit(ctx: EvaluatorContext, meta: { storeKey: StoreKey }): Promise<boolean> {
  const row = await ctx.prisma.userStore.findFirst({
    where: { userId: ctx.userId, storeKey: meta.storeKey, status: 'visited' }
  })
  return row !== null
}

export async function evaluateAreaAny(ctx: EvaluatorContext, meta: { region: BadgeArea }): Promise<boolean> {
  const storeKeys = PHYSICAL_STORE_KEYS.filter((k) => storeKeyToBadgeArea[k] === meta.region)
  const count = await ctx.prisma.userStore.count({
    where: { userId: ctx.userId, storeKey: { in: storeKeys as string[] }, status: 'visited' }
  })
  return count >= 1
}

export async function evaluateAreaComplete(ctx: EvaluatorContext, meta: { region: BadgeArea }): Promise<boolean> {
  const storeKeys = PHYSICAL_STORE_KEYS.filter((k) => storeKeyToBadgeArea[k] === meta.region)
  const count = await ctx.prisma.userStore.count({
    where: { userId: ctx.userId, storeKey: { in: storeKeys as string[] }, status: 'visited' }
  })
  return count >= storeKeys.length
}

export async function evaluateCount(ctx: EvaluatorContext, meta: { count: number }): Promise<boolean> {
  const count = await ctx.prisma.userStore.count({
    where: {
      userId: ctx.userId,
      storeKey: { in: PHYSICAL_STORE_KEYS as string[] },
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

export async function evaluateEventClearAtStore(ctx: EvaluatorContext, meta: { storeKey: StoreKey }): Promise<boolean> {
  const row = await ctx.prisma.userEvent.findFirst({
    where: {
      userId: ctx.userId,
      status: 'completed',
      event: {
        stores: { some: { storeKey: meta.storeKey } }
      }
    }
  })
  return row !== null
}

export async function evaluateEventClearAreaAny(ctx: EvaluatorContext, meta: { region: BadgeArea }): Promise<boolean> {
  const storeKeys = PHYSICAL_STORE_KEYS.filter((k) => storeKeyToBadgeArea[k] === meta.region)
  const row = await ctx.prisma.userEvent.findFirst({
    where: {
      userId: ctx.userId,
      status: 'completed',
      event: {
        stores: { some: { storeKey: { in: storeKeys as string[] } } }
      }
    }
  })
  return row !== null
}

export async function evaluateEventClearAreaComplete(
  ctx: EvaluatorContext,
  meta: { region: BadgeArea }
): Promise<boolean> {
  const storeKeys = PHYSICAL_STORE_KEYS.filter((k) => storeKeyToBadgeArea[k] === meta.region)
  // For each store in the area, check that the user has at least one completed event at that store.
  const results = await Promise.all(storeKeys.map((sk) => evaluateEventClearAtStore(ctx, { storeKey: sk })))
  return results.every(Boolean)
}

export async function evaluateEventClearCount(ctx: EvaluatorContext, meta: { count: number }): Promise<boolean> {
  // Count distinct store keys across the user's completed events.
  const completedEvents = await ctx.prisma.userEvent.findMany({
    where: { userId: ctx.userId, status: 'completed' },
    select: {
      event: {
        select: { stores: { select: { storeKey: true } } }
      }
    }
  })
  const clearedStores = new Set<string>()
  for (const ue of completedEvents) {
    for (const es of ue.event.stores) {
      if ((PHYSICAL_STORE_KEYS as string[]).includes(es.storeKey)) {
        clearedStores.add(es.storeKey)
      }
    }
  }
  return clearedStores.size >= meta.count
}

export async function evaluateEventClearAll(ctx: EvaluatorContext): Promise<boolean> {
  return evaluateEventClearCount(ctx, { count: PHYSICAL_STORE_KEYS.length })
}

export async function evaluateVoteTotal(ctx: EvaluatorContext, meta: { count: number }): Promise<boolean> {
  const count = await ctx.prisma.vote.count({
    where: { userId: ctx.userId }
  })
  return count >= meta.count
}

export async function evaluateVoteUnique(ctx: EvaluatorContext, meta: { count: number }): Promise<boolean> {
  const rows = await ctx.prisma.vote.groupBy({
    by: ['characterId'],
    where: { userId: ctx.userId }
  })
  return rows.length >= meta.count
}

export async function evaluateVoteDevotion(ctx: EvaluatorContext, meta: { count: number }): Promise<boolean> {
  const rows = await ctx.prisma.vote.groupBy({
    by: ['characterId'],
    where: { userId: ctx.userId },
    _count: { characterId: true },
    orderBy: { _count: { characterId: 'desc' } },
    take: 1
  })
  if (rows.length === 0) return false
  return rows[0]._count.characterId >= meta.count
}

export async function evaluateVoteAllBiccame(ctx: EvaluatorContext): Promise<boolean> {
  const voted = await ctx.prisma.vote.groupBy({
    by: ['characterId'],
    where: { userId: ctx.userId, characterId: { in: Array.from(BICCAME_MUSUME_IDS) } }
  })
  return voted.length >= BICCAME_MUSUME_IDS.size
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

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export async function evaluateBadge(ctx: EvaluatorContext, badge: Badge): Promise<boolean> {
  const meta = JSON.parse(badge.conditionMeta) as BadgeConditionMeta
  const sub = badge.subCategory as BadgeSubCategory

  switch (sub) {
    case 'visit':
      if (!meta.storeKey) throw new Error(`Badge ${badge.code}: missing storeKey`)
      return evaluateVisit(ctx, { storeKey: meta.storeKey as StoreKey })

    case 'area_any':
      if (!meta.region) throw new Error(`Badge ${badge.code}: missing region`)
      return evaluateAreaAny(ctx, { region: meta.region as BadgeArea })

    case 'area_complete':
      if (!meta.region) throw new Error(`Badge ${badge.code}: missing region`)
      return evaluateAreaComplete(ctx, { region: meta.region as BadgeArea })

    case 'count':
      if (meta.count === undefined) throw new Error(`Badge ${badge.code}: missing count`)
      return evaluateCount(ctx, { count: meta.count })

    case 'event_count':
      if (meta.count === undefined) throw new Error(`Badge ${badge.code}: missing count`)
      return evaluateEventCount(ctx, { count: meta.count })

    case 'event_clear_at_store':
      if (!meta.storeKey) throw new Error(`Badge ${badge.code}: missing storeKey`)
      return evaluateEventClearAtStore(ctx, { storeKey: meta.storeKey as StoreKey })

    case 'event_clear_area_any':
      if (!meta.region) throw new Error(`Badge ${badge.code}: missing region`)
      return evaluateEventClearAreaAny(ctx, { region: meta.region as BadgeArea })

    case 'event_clear_area_complete':
      if (!meta.region) throw new Error(`Badge ${badge.code}: missing region`)
      return evaluateEventClearAreaComplete(ctx, { region: meta.region as BadgeArea })

    case 'event_clear_count':
      if (meta.count === undefined) throw new Error(`Badge ${badge.code}: missing count`)
      return evaluateEventClearCount(ctx, { count: meta.count })

    case 'event_clear_all':
      return evaluateEventClearAll(ctx)

    case 'vote_total':
      if (meta.count === undefined) throw new Error(`Badge ${badge.code}: missing count`)
      return evaluateVoteTotal(ctx, { count: meta.count })

    case 'vote_unique':
      if (meta.count === undefined) throw new Error(`Badge ${badge.code}: missing count`)
      return evaluateVoteUnique(ctx, { count: meta.count })

    case 'vote_devotion':
      if (meta.count === undefined) throw new Error(`Badge ${badge.code}: missing count`)
      return evaluateVoteDevotion(ctx, { count: meta.count })

    case 'vote_all_biccame':
      return evaluateVoteAllBiccame(ctx)

    case 'special_multi_store_clear':
      if (!meta.storeKeys) throw new Error(`Badge ${badge.code}: missing storeKeys`)
      return evaluateSpecialMultiStoreClear(ctx, { storeKeys: meta.storeKeys as StoreKey[] })

    case 'special_event_id':
      if (!meta.eventId) throw new Error(`Badge ${badge.code}: missing eventId`)
      return evaluateSpecialEventId(ctx, { eventId: meta.eventId })

    default: {
      const _exhaustive: never = sub
      throw new Error(`Unknown badge subCategory: ${_exhaustive}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Batch helpers
// ---------------------------------------------------------------------------

/**
 * Evaluate all not-yet-earned badges (or the specified subset) for a user.
 * Inserts UserBadge rows for newly earned badges and returns them.
 */
export async function evaluateAndAwardBadges(ctx: EvaluatorContext, candidateCodes?: string[]): Promise<Badge[]> {
  // Fetch already-earned badge codes for this user.
  const earned = await ctx.prisma.userBadge.findMany({
    where: { userId: ctx.userId },
    select: { badgeCode: true }
  })
  const earnedSet = new Set(earned.map((b) => b.badgeCode))

  // Fetch candidate badges, filtering out already-earned ones.
  const whereCode = candidateCodes
    ? { code: { in: candidateCodes }, NOT: { code: { in: Array.from(earnedSet) } } }
    : { NOT: { code: { in: Array.from(earnedSet) } } }

  const candidates = await ctx.prisma.badge.findMany({
    where: { isHidden: false, ...whereCode }
  })

  const newBadges: Badge[] = []

  for (const badge of candidates) {
    const earned = await evaluateBadge(ctx, badge)
    if (earned) {
      try {
        await ctx.prisma.userBadge.create({
          data: { userId: ctx.userId, badgeCode: badge.code }
        })
        newBadges.push(badge)
      } catch {
        // UNIQUE violation means the badge was already awarded concurrently — swallow silently.
      }
    }
  }

  return newBadges
}

// ---------------------------------------------------------------------------
// Hook helpers (narrow the candidate set per the "実行タイミング" table)
// ---------------------------------------------------------------------------

/**
 * Called from PUT /me/stores/:storeKey when status='visited'.
 * Evaluates: visit[storeKey], area_any[region], area_complete[region], count[*], milestone_count_all
 */
export async function evaluateOnVisit(ctx: EvaluatorContext, storeKey: StoreKey): Promise<Badge[]> {
  const area = storeKeyToBadgeArea[storeKey]

  // Collect all badge codes relevant to a store visit event.
  const allBadges = await ctx.prisma.badge.findMany({
    where: { isHidden: false },
    select: { code: true }
  })

  const candidateCodes = allBadges
    .map((b) => b.code)
    .filter((code) => {
      return (
        code === `store_visit_${storeKey}` ||
        code === `area_any_${area}` ||
        code === `area_complete_${area}` ||
        code.startsWith('milestone_count_')
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
  // Fetch the event's associated store keys.
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
    where: { isHidden: false },
    select: { code: true, subCategory: true, conditionMeta: true }
  })

  const candidateCodes = allBadges
    .filter((b) => {
      const sub = b.subCategory as BadgeSubCategory
      if (sub === 'event_count') return true
      if (sub === 'event_clear_count') return true
      if (sub === 'event_clear_all') return true
      if (sub === 'special_event_id') {
        const meta = JSON.parse(b.conditionMeta) as BadgeConditionMeta
        return meta.eventId === eventId
      }
      if (sub === 'special_multi_store_clear') {
        const meta = JSON.parse(b.conditionMeta) as BadgeConditionMeta
        return (meta.storeKeys ?? []).some((sk) => storeKeys.includes(sk))
      }
      if (sub === 'event_clear_at_store') {
        const meta = JSON.parse(b.conditionMeta) as BadgeConditionMeta
        return storeKeys.includes(meta.storeKey ?? '')
      }
      if (sub === 'event_clear_area_any' || sub === 'event_clear_area_complete') {
        const meta = JSON.parse(b.conditionMeta) as BadgeConditionMeta
        return areas.has(meta.region as BadgeArea)
      }
      return false
    })
    .map((b) => b.code)

  return evaluateAndAwardBadges(ctx, candidateCodes)
}

/**
 * Called from POST /votes/* when a vote is cast for a characterId by an authenticated user.
 * Evaluates: vote_total[*], vote_unique[*], vote_devotion[*], vote_all_biccame
 */
export async function evaluateOnVote(ctx: EvaluatorContext, _characterId: string): Promise<Badge[]> {
  const allBadges = await ctx.prisma.badge.findMany({
    where: { isHidden: false },
    select: { code: true, subCategory: true }
  })

  const candidateCodes = allBadges
    .filter((b) => {
      const sub = b.subCategory as BadgeSubCategory
      return sub === 'vote_total' || sub === 'vote_unique' || sub === 'vote_devotion' || sub === 'vote_all_biccame'
    })
    .map((b) => b.code)

  return evaluateAndAwardBadges(ctx, candidateCodes)
}
