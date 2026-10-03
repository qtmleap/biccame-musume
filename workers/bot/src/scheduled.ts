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

// Phase 1では既知cronも実行しない。通知機能・secretは次段階で追加する。
export const handleBotScheduled = (controller: Pick<ScheduledController, 'cron'>): void => {
  const kind = classifyBotCron(controller.cron)
  if (kind === 'unknown') console.warn('bot scheduled: unknown cron')
  else console.info(`bot scheduled: ${kind} disabled`)
}
