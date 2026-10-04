import { type DailyTargetsResult, dailyRequestSchema, dailyTargetsResultSchema } from '@biccame/shared/bot'
import { getEventsEndingToday, getEventsStartingToday } from '@/services/event-service'
import type { Bindings } from '@/types/bindings'
import { buildDailySummaryTweets, buildEndingTodaySummaryTweets } from '@/utils/tweet-text'

type Dependencies = { starting: typeof getEventsStartingToday; ending: typeof getEventsEndingToday }
export const readBotDailyTargets = async (
  env: Bindings,
  input: unknown,
  dependencies: Dependencies = { starting: getEventsStartingToday, ending: getEventsEndingToday }
): Promise<DailyTargetsResult> => {
  const parsed = dailyRequestSchema.safeParse(input)
  if (!parsed.success) return { ok: false, kind: 'unavailable' }
  try {
    const scheduled = new Date(parsed.data.scheduledAt)
    const [starting, ending] = await Promise.all([
      dependencies.starting(env, scheduled),
      dependencies.ending(env, scheduled)
    ])
    const result = dailyTargetsResultSchema.safeParse({
      ok: true,
      targets: {
        scheduledAt: parsed.data.scheduledAt,
        starting: { eventUUIDs: starting.map((event) => event.uuid), texts: buildDailySummaryTweets(starting) },
        ending: { eventUUIDs: ending.map((event) => event.uuid), texts: buildEndingTodaySummaryTweets(ending) }
      }
    })
    return result.success ? result.data : { ok: false, kind: 'unavailable' }
  } catch {
    return { ok: false, kind: 'unavailable' }
  }
}
