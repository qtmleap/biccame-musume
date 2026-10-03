import type { Bindings } from '@/types/bindings'
import type { TwitterHealthError } from '@/utils/twitter-health'

export type DiscordNotificationResult = 'sent' | 'unconfigured' | 'invalid_config' | 'failed'

/** 認証情報や外部レスポンスを含めず、固定の監視エラーだけを通知する。 */
export const notifyTwitterHealthFailure = async (
  env: Bindings,
  failure: TwitterHealthError,
  scheduledAt: Date
): Promise<DiscordNotificationResult> => {
  if (!env.DISCORD_WEBHOOK_URL?.trim()) {
    console.error('[Discord] X health notification not sent: DISCORD_WEBHOOK_URL is not configured')
    return 'unconfigured'
  }

  let url: URL
  try {
    url = new URL(env.DISCORD_WEBHOOK_URL)
    if (
      url.protocol !== 'https:' ||
      !['discord.com', 'discordapp.com'].includes(url.hostname) ||
      url.port ||
      url.username ||
      url.password ||
      !/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[^/]+$/.test(url.pathname) ||
      url.search ||
      url.hash
    ) {
      throw new Error('Invalid webhook')
    }
  } catch {
    console.error('[Discord] X health notification not sent: invalid webhook configuration')
    return 'invalid_config'
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content: [
          '[ビッカメ娘] 毎朝のX連携確認に失敗しました。開始・終了イベントの自動投稿を停止しました。',
          `確認時刻: ${scheduledAt.toISOString()}`,
          `種別: ${failure.kind}${failure.status ? ` (HTTP ${failure.status})` : ''}`,
          failure.message,
          '管理画面 /admin/twitter と Workers の secret 設定を確認してください。'
        ].join('\n'),
        allowed_mentions: { parse: [] }
      })
    })
    if (!response.ok) {
      console.error('[Discord] X health notification failed:', { status: response.status })
      return 'failed'
    }
    console.log('[Discord] X health notification sent')
    return 'sent'
  } catch {
    console.error('[Discord] X health notification failed: network error or timeout')
    return 'failed'
  }
}
