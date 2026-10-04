import type { AppBotReadRpc } from '@biccame/shared/bot'
import { notifyBotHealthFailure } from './health-notification'
import { type PostingFlags, runBotDaily } from './posting'
import { createPostingTransport } from './posting-transport'
import type { Bindings } from './timeline/utils/bindings'
import { TimelineFailure } from './timeline/utils/failure'
import { runTimeline } from './timeline/utils/scheduled'

export type BotBindings = Partial<Bindings> &
  PostingFlags & {
    TL_NOTIFICATIONS_ENABLED?: string
    DISCORD_WEBHOOK_URL?: string
    APP?: AppBotReadRpc
  }

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

const runDaily = async (env: BotBindings, scheduledAt: string): Promise<void> => {
  const transport = createPostingTransport(env)
  if (!transport) {
    console.error('bot daily: credentials unavailable')
    return
  }
  await runBotDaily(env, scheduledAt, transport, {
    app: env.APP,
    notifyHealthFailure: (error, time) => notifyBotHealthFailure(env, error, time)
  })
}

export const handleBotScheduled = async (
  controller: Pick<ScheduledController, 'cron'> & Partial<Pick<ScheduledController, 'scheduledTime'>>,
  env: BotBindings = {},
  run: typeof runTimeline = runTimeline,
  daily: typeof runDaily = runDaily
): Promise<void> => {
  const kind = classifyBotCron(controller.cron)
  if (kind === 'unknown') {
    console.warn('bot scheduled: unknown cron')
    return
  }
  if (kind === 'daily') {
    if (env.X_POSTING_ENABLED !== 'true') {
      console.info('bot scheduled: daily disabled')
      return
    }
    if (typeof controller.scheduledTime !== 'number' || !Number.isFinite(controller.scheduledTime)) {
      console.error('bot daily: invalid scheduled time')
      return
    }
    try {
      await daily(env, new Date(controller.scheduledTime).toISOString())
    } catch {
      console.error('bot daily: execution failed')
    }
    return
  }
  if (env.TL_NOTIFICATIONS_ENABLED !== 'true') {
    console.info('bot scheduled: timeline disabled')
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
