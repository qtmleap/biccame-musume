import {
  getEventsEndingInWeek,
  getEventsEndingToday,
  getEventsStartingInWeek,
  getEventsStartingToday
} from '@api/services/event-service'
import { createPostingTransport } from '@api/services/posting-transport'
import { notifySocialHealthFailure } from '@api/services/social-health'
import { recoverSocialJobs } from '@api/services/social-posting'
import { recoverableSocialSummarySchedules, reserveSocialSummary, socialDateWindow } from '@api/services/social-summary'
import type { Bindings } from '@api/types/bindings'
import { socialWeekWindow } from '@biccame/shared/domain/social-post'
import { TwitterHealthError } from '@biccame/shared/x/health'
import dayjs from 'dayjs'

export { socialDateWindow } from '@api/services/social-summary'

export const checkScheduledPostingHealth = async (env: Bindings, scheduledAt: string) => {
  if (env.X_POSTING_ENABLED !== 'true') return
  try {
    const transport = createPostingTransport(env)
    if (!transport) throw new TwitterHealthError('missing_credentials')
    await transport.checkAuthenticatedSession()
  } catch (error) {
    await notifySocialHealthFailure(env, error, scheduledAt)
  }
}
type Dependencies = {
  starting: typeof getEventsStartingToday
  ending: typeof getEventsEndingToday
  weekStarting: typeof getEventsStartingInWeek
  weekEnding: typeof getEventsEndingInWeek
  reserve: typeof reserveSocialSummary
  recover: typeof recoverSocialJobs
  health: typeof checkScheduledPostingHealth
}
const dependencies: Dependencies = {
  starting: getEventsStartingToday,
  ending: getEventsEndingToday,
  weekStarting: getEventsStartingInWeek,
  weekEnding: getEventsEndingInWeek,
  reserve: reserveSocialSummary,
  recover: recoverSocialJobs,
  health: checkScheduledPostingHealth
}
export const runSocialSchedule = async (env: Bindings, scheduledAt: string, deps: Dependencies = dependencies) => {
  if (env.X_POSTING_ENABLED !== 'true' && env.DISCORD_POSTING_ENABLED !== 'true') return
  await deps.health(env, scheduledAt).catch(() => console.error('[social] health monitoring failed'))
  // 毎日 daily を1回、月曜はさらに weekly を1回。開始と終了は1つの投稿にまとまる。
  const kinds = socialDateWindow(scheduledAt).monday ? (['daily', 'weekly'] as const) : (['daily'] as const)
  // 一区分の読み取り・保存障害で、ほかの投稿区分を中断しない。
  await Promise.all(
    kinds.map(async (kind) => {
      try {
        await deps.reserve(env, kind, scheduledAt, async (fixedScheduledAt) => {
          if (kind === 'daily') {
            const now = dayjs(fixedScheduledAt).toDate()
            const [starting, ending] = await Promise.all([deps.starting(env, now), deps.ending(env, now)])
            return { starting, ending }
          }
          const window = socialWeekWindow(fixedScheduledAt)
          const [starting, ending] = await Promise.all([
            deps.weekStarting(env, window.from, window.until),
            deps.weekEnding(env, window.from, window.until)
          ])
          return { starting, ending }
        })
      } catch {
        console.error(`[social-summary] ${kind} preparation failed`)
      }
    })
  )
  await deps.recover(env)
}

/** 復旧時は元のcron時刻を維持し、日次認証監視やQueue全体回収を繰り返さない。 */
export const recoverSocialSummaries = async (env: Bindings, deps: Dependencies = dependencies) => {
  if (env.X_POSTING_ENABLED !== 'true' && env.DISCORD_POSTING_ENABLED !== 'true') return
  const schedules = await recoverableSocialSummarySchedules(env)
  for (const scheduledAt of schedules) {
    await runSocialSchedule(env, scheduledAt, { ...deps, health: async () => {}, recover: async () => {} })
  }
}
