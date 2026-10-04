import { getPrisma } from '@/lib/prisma'
import { evaluateAllUsersBadges } from '@/services/badge'
import type { Bindings } from '@/types/bindings'

export const reevaluateRecentBadges = async (env: Bindings, scheduledAt: Date): Promise<void> => {
  const prisma = getPrisma(env)
  const since = new Date(scheduledAt.getTime() - 25 * 60 * 60 * 1000)
  const { processedUsers, totalAwarded } = await evaluateAllUsersBadges(env, prisma, 25, { since })
  console.log(
    `[Cron] Badge re-evaluation: users=${processedUsers} newly_awarded=${totalAwarded} since=${since.toISOString()}`
  )
}

export const runBadgeCron = async (
  env: Bindings,
  scheduledAt: Date,
  run: typeof reevaluateRecentBadges = reevaluateRecentBadges
): Promise<void> => {
  try {
    await run(env, scheduledAt)
  } catch {
    console.error('[Cron] Failed to re-evaluate badges')
  }
}
