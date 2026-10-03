import type { Bindings } from './timeline/utils/bindings'
import { TimelineFailure } from './timeline/utils/failure'
import { runTimeline } from './timeline/utils/scheduled'

export type BotBindings = Partial<Bindings> & { TL_NOTIFICATIONS_ENABLED?: string }

export const classifyBotCron = (cron: string): 'timeline' | 'daily' | 'unknown' => {
  switch (cron) {
    case '*/5 0-12 * * *':
      return 'timeline'
    case '0 0 * * *':
      return 'daily'
    default:
      return 'unknown'
  }
}

const requiredBindings = [
  'TWITTER_BEARER_TOKEN',
  'TWITTER_AUTH_TOKEN',
  'TWITTER_CSRF_TOKEN',
  'DISCORD_CHANNEL_ID',
  'DISCORD_TOKEN',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_MODEL'
] as const

const isConfigured = (env: BotBindings): env is Bindings & BotBindings =>
  requiredBindings.every((key) => typeof env[key] === 'string' && env[key].trim().length > 0)

export const handleBotScheduled = async (
  controller: Pick<ScheduledController, 'cron'>,
  env: BotBindings = {},
  run: typeof runTimeline = runTimeline
): Promise<void> => {
  const kind = classifyBotCron(controller.cron)
  if (kind === 'unknown') {
    console.warn('bot scheduled: unknown cron')
    return
  }
  if (kind !== 'timeline' || env.TL_NOTIFICATIONS_ENABLED !== 'true') {
    console.info(`bot scheduled: ${kind} disabled`)
    return
  }
  if (!isConfigured(env)) {
    console.error('bot scheduled: configuration failure')
    return
  }
  try {
    await run(env)
  } catch (error) {
    console.error('bot scheduled: timeline failure', {
      kind: error instanceof TimelineFailure ? error.kind : 'analysis',
      status: error instanceof TimelineFailure ? error.status : undefined
    })
  }
}
