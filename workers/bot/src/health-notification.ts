import { normalizeTwitterHealthError } from '@biccame/shared/x/health'

// 候補通知のDiscord Bot APIとは別用途。監視Webhookにはメンション抑止を維持する。
export const notifyBotHealthFailure = async (
  env: { DISCORD_WEBHOOK_URL?: string },
  error: unknown,
  scheduledAt: string
): Promise<'sent' | 'unconfigured' | 'invalid_config' | 'failed'> => {
  if (!env.DISCORD_WEBHOOK_URL?.trim()) {
    console.error('bot health: webhook unconfigured')
    return 'unconfigured'
  }
  const failure = normalizeTwitterHealthError(error)
  let url: URL
  try {
    url = new URL(env.DISCORD_WEBHOOK_URL)
    if (
      url.protocol !== 'https:' ||
      !['discord.com', 'discordapp.com'].includes(url.hostname) ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[^/]+$/.test(url.pathname)
    )
      throw new Error('Invalid webhook')
  } catch {
    console.error('bot health: invalid webhook configuration')
    return 'invalid_config'
  }
  try {
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content: [
          '[ビッカメ娘] 毎朝のX連携確認に失敗しました。開始・終了イベントの自動投稿を停止しました。',
          `確認時刻: ${scheduledAt}`,
          `種別: ${failure.kind}${failure.status ? ` (HTTP ${failure.status})` : ''}`,
          failure.message,
          '管理画面 /admin/twitter と Workers の secret 設定を確認してください。'
        ].join('\n'),
        allowed_mentions: { parse: [] }
      })
    })
    await response.body?.cancel()
    if (!response.ok) {
      console.error('bot health: webhook rejected', { status: response.status })
      return 'failed'
    }
    return 'sent'
  } catch {
    console.error('bot health: webhook network failure')
    return 'failed'
  }
}
