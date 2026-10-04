import { reevaluateRecentBadges } from '@/services/badge-cron'
import { getEventsEndingToday, getEventsStartingToday } from '@/services/event-service'
import type { Bindings } from '@/types/bindings'
import { notifyTwitterHealthFailure } from '@/utils/discord'
import { Twitter } from '@/utils/twitter'
import { normalizeTwitterHealthError } from '@/utils/twitter-health'

export type DailyCronDependencies = {
  twitter: Pick<Twitter, 'checkAuthenticatedSession' | 'tweetDailySummary' | 'tweetEndingTodaySummary'>
  startingToday: typeof getEventsStartingToday
  endingToday: typeof getEventsEndingToday
  notify: typeof notifyTwitterHealthFailure
  reevaluateBadges: () => Promise<void>
}

const defaultDependencies = (env: Bindings, scheduledAt: Date): DailyCronDependencies => ({
  twitter: new Twitter(env),
  startingToday: getEventsStartingToday,
  endingToday: getEventsEndingToday,
  notify: notifyTwitterHealthFailure,
  reevaluateBadges: () => reevaluateRecentBadges(env, scheduledAt)
})

export const runDailyCron = async (
  env: Bindings,
  scheduledAt: Date,
  deps: DailyCronDependencies = defaultDependencies(env, scheduledAt)
): Promise<void> => {
  const postEvents = async (): Promise<void> => {
    // イベント0件でも確認する。失効・別アカウント・確認不能時は投稿しない。
    try {
      await deps.twitter.checkAuthenticatedSession()
      console.log('[Cron] X authenticated session verified')
    } catch (error) {
      const failure = normalizeTwitterHealthError(error)
      console.error('[Cron] X health check failed; daily posts skipped:', {
        kind: failure.kind,
        status: failure.status
      })
      try {
        await deps.notify(env, failure, scheduledAt)
      } catch {
        console.error('[Cron] X health notification failed unexpectedly')
      }
      return
    }

    const postStartingToday = async (): Promise<void> => {
      try {
        const events = await deps.startingToday(env, scheduledAt)
        if (events.length === 0) {
          console.log('[Cron] No events starting today (JST), skipping daily summary tweet')
          return
        }
        console.log(`[Cron] Posting daily summary for ${events.length} event(s) starting today`)
        await deps.twitter.tweetDailySummary(events)
      } catch {
        console.error('[Cron] Failed to post daily summary tweet')
      }
    }

    const postEndingToday = async (): Promise<void> => {
      try {
        const events = await deps.endingToday(env, scheduledAt)
        if (events.length === 0) {
          console.log('[Cron] No events ending today (JST), skipping ending-today tweet')
          return
        }
        console.log(`[Cron] Posting ending-today summary for ${events.length} event(s)`)
        await deps.twitter.tweetEndingTodaySummary(events)
      } catch {
        console.error('[Cron] Failed to post ending-today summary tweet')
      }
    }

    await Promise.all([postStartingToday(), postEndingToday()])
  }

  const reevaluateBadges = async (): Promise<void> => {
    try {
      await deps.reevaluateBadges()
    } catch {
      console.error('[Cron] Failed to re-evaluate badges')
    }
  }

  await Promise.all([postEvents(), reevaluateBadges()])
}
