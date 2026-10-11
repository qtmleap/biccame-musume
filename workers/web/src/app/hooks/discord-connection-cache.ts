import { type DiscordStatus, discordStatusSchema } from '@biccame/shared/bot'
import type { AdminBotStatus } from '@biccame/shared/schemas/admin-bot.dto'

export const DISCORD_CONNECTION_CACHE_KEY = 'biccame:admin:discord-connection:v1'
const cachedConnectionSchema = discordStatusSchema.pick({
  configFingerprint: true,
  connection: true,
  bot: true,
  channel: true,
  sendPermission: true,
  errorKind: true,
  fetchedAt: true
})

const cacheable = (status: DiscordStatus) =>
  status.configFingerprint !== null &&
  status.settings.token === 'valid' &&
  status.settings.channel === 'valid' &&
  status.connection !== 'unchecked' &&
  status.connection !== 'unconfigured'

// APIクエリや認証情報ではなく、同じ設定に対する前回の確認結果だけを保存する。
export const saveDiscordConnection = (result: AdminBotStatus): void => {
  try {
    if (!result.botConnected || result.error !== null || !result.discord || !cacheable(result.discord)) return
    const parsed = cachedConnectionSchema.safeParse({
      configFingerprint: result.discord.configFingerprint,
      connection: result.discord.connection,
      bot: result.discord.bot,
      channel: result.discord.channel,
      sendPermission: result.discord.sendPermission,
      errorKind: result.discord.errorKind,
      fetchedAt: result.discord.fetchedAt
    })
    if (parsed.success) localStorage.setItem(DISCORD_CONNECTION_CACHE_KEY, JSON.stringify(parsed.data))
  } catch {
    // ストレージが使えなくても接続確認と画面表示は継続する。
  }
}

export const restoreDiscordConnection = (result: AdminBotStatus): AdminBotStatus => {
  try {
    const discord = result.discord
    if (!result.botConnected || result.error !== null || !discord) return result
    if (
      discord.configFingerprint === null ||
      discord.settings.token !== 'valid' ||
      discord.settings.channel !== 'valid'
    ) {
      localStorage.removeItem(DISCORD_CONNECTION_CACHE_KEY)
      return result
    }
    if (discord.connection !== 'unchecked') return result
    const stored = localStorage.getItem(DISCORD_CONNECTION_CACHE_KEY)
    if (stored === null) return result
    const parsed = cachedConnectionSchema.safeParse(JSON.parse(stored))
    if (
      !parsed.success ||
      parsed.data.configFingerprint !== discord.configFingerprint ||
      parsed.data.connection === 'unchecked' ||
      parsed.data.connection === 'unconfigured'
    ) {
      localStorage.removeItem(DISCORD_CONNECTION_CACHE_KEY)
      return result
    }
    return { ...result, discord: { ...discord, ...parsed.data } }
  } catch {
    return result
  }
}
