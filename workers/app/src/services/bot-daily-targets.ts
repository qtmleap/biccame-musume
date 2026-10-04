import { type DailyTargetsResult, dailyRequestSchema, dailyTargetsResultSchema } from '@biccame/shared/bot'
import { getEventsEndingToday, getEventsStartingToday } from '@/services/event-service'
import type { Bindings } from '@/types/bindings'
import { buildDailySummaryTweets, buildEndingTodaySummaryTweets } from '@/utils/tweet-text'

type Dependencies = { starting: typeof getEventsStartingToday; ending: typeof getEventsEndingToday }
const unavailable = (stage: string, detail: Record<string, unknown> = {}): DailyTargetsResult => {
  // 本文・DB値・例外文字列は出さず、失敗段階と型だけを残す。
  console.error('[bot-read] daily targets unavailable', { stage, ...detail })
  return { ok: false, kind: 'unavailable' }
}

export const readBotDailyTargets = async (
  env: Bindings,
  input: unknown,
  dependencies: Dependencies = { starting: getEventsStartingToday, ending: getEventsEndingToday }
): Promise<DailyTargetsResult> => {
  const parsed = dailyRequestSchema.safeParse(input)
  if (!parsed.success) return unavailable('request')
  const scheduled = new Date(parsed.data.scheduledAt)
  let starting: Awaited<ReturnType<typeof getEventsStartingToday>>
  let ending: Awaited<ReturnType<typeof getEventsEndingToday>>
  try {
    ;[starting, ending] = await Promise.all([
      dependencies.starting(env, scheduled),
      dependencies.ending(env, scheduled)
    ])
  } catch (error) {
    return unavailable('query', { errorName: error instanceof Error ? error.name : 'unknown' })
  }
  let startingTexts: string[]
  let endingTexts: string[]
  try {
    // 既存builderは0件を不正入力として例外にする。旧日次処理と同じく0件は投稿しない。
    startingTexts = starting.length ? buildDailySummaryTweets(starting) : []
    endingTexts = ending.length ? buildEndingTodaySummaryTweets(ending) : []
  } catch (error) {
    return unavailable('text', { errorName: error instanceof Error ? error.name : 'unknown' })
  }
  const result = dailyTargetsResultSchema.safeParse({
    ok: true,
    targets: {
      scheduledAt: parsed.data.scheduledAt,
      starting: { eventUUIDs: starting.map((event) => event.uuid), texts: startingTexts },
      ending: { eventUUIDs: ending.map((event) => event.uuid), texts: endingTexts }
    }
  })
  if (!result.success) {
    return unavailable('contract', {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.map((part) => (typeof part === 'number' ? '#' : String(part))).join('.'),
        code: issue.code
      }))
    })
  }
  return result.data
}
