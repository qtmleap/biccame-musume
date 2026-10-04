// 生成済みWrangler設定は環境が解決済み。CLOUDFLARE_ENV/--envを渡すと名前に環境名が再付与され、
// 別Workerが作られてカスタムドメインやDurable Objectが移る。
export const wranglerDeployEnvironment = (source: Record<string, string | undefined>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(source).filter((entry): entry is [string, string] => entry[0] !== 'CLOUDFLARE_ENV' && entry[1] !== undefined)
  )

export const assertNoEnvironmentArgument = (args: string[]): void => {
  if (args.some((arg) => arg === '--env' || arg === '-e' || arg.startsWith('--env='))) {
    throw new Error('Do not pass --env to a generated Worker config; build with CLOUDFLARE_ENV instead')
  }
}
