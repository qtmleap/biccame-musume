export const workerNames = (environment?: string) => {
  if (!environment) return { app: 'biccame-musume', bot: 'musume-workers' }
  if (environment === 'staging') return { app: 'biccame-musume-dev', bot: 'musume-workers-staging' }
  if (environment === 'production') return { app: 'biccame-musume-prod', bot: 'musume-workers' }
  throw new Error('Unknown Worker environment')
}

export const appBotBinding = (environment?: string, local = false) => ({
  binding: 'BOT', service: local ? 'musume-workers' : workerNames(environment).bot, entrypoint: 'BotService'
})
export const botAppBinding = (environment?: string) => ({
  binding: 'APP', service: workerNames(environment).app, entrypoint: 'AppBotReadService'
})
