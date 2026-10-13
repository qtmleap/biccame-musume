import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import type { DiscordStatus } from '@biccame/shared/bot'
import { type AdminBotStatus, AdminBotStatusSchema } from '@biccame/shared/schemas/admin-bot.dto'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  DISCORD_CONNECTION_CACHE_KEY,
  restoreDiscordConnection,
  saveDiscordConnection
} from '../workers/web/src/app/hooks/discord-connection-cache'
import {
  ADMIN_BOT_QUERY_KEY,
  useAdminBotConnection,
  useAdminBotStatus
} from '../workers/web/src/app/hooks/use-admin-bot'
import { client } from '../workers/web/src/app/utils/client'

const timestamp = '2026-10-12T12:00:00.000Z'
const fingerprint = 'a'.repeat(64)
const passiveDiscord: DiscordStatus = {
  configFingerprint: fingerprint,
  configured: { token: true, channel: true },
  settings: { token: 'valid', channel: 'valid' },
  notificationsEnabled: true,
  xPostingEnabled: false,
  discordPostingEnabled: false,
  timelineNotificationsEnabled: false,
  connection: 'unchecked',
  bot: null,
  channel: null,
  sendPermission: 'unknown',
  errorKind: null,
  fetchedAt: '2026-10-12T13:00:00.000Z'
}
const passive = (discord: DiscordStatus | null = passiveDiscord): AdminBotStatus => ({
  fetchedAt: '2026-10-12T13:00:00.000Z',
  botConnected: true,
  discord,
  webhook: {
    configured: true,
    queueConfigured: true,
    model: 'clef',
    eventThreshold: 0.9,
    ignoreThreshold: 0.95,
    choiceThreshold: 0.95,
    fieldThresholds: {
      single_event: 0.95,
      status: 0.8,
      category: 0.95,
      store: 0.95,
      start_date: 0.95,
      end_date: 0.95,
      quantity: 0.95,
      condition: 0.95,
      purchase_amount: 0.95
    }
  },
  error: null
})
const checked = (): AdminBotStatus =>
  passive({
    ...passiveDiscord,
    connection: 'connected',
    bot: { id: '123', username: 'synthetic-bot' },
    channel: { id: '456', name: 'synthetic-channel' },
    fetchedAt: timestamp
  })
const contents = new Map<string, string>()
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
beforeEach(() => {
  contents.clear()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => (contents.has(key) ? contents.get(key) : null),
      setItem: (key: string, value: string) => contents.set(key, value),
      removeItem: (key: string) => contents.delete(key)
    }
  })
})
afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage)
  else Reflect.deleteProperty(globalThis, 'localStorage')
})

test('reload restores last connection result and time while retaining current passive flags', () => {
  saveDiscordConnection(checked())
  const current = {
    ...passive({
      ...passiveDiscord,
      xPostingEnabled: true,
      discordPostingEnabled: true,
      timelineNotificationsEnabled: true
    }),
    webhook: { ...passive().webhook, model: 'clef-flash' as const }
  }
  const reloaded = restoreDiscordConnection(current)
  expect(reloaded.discord?.connection).toBe('connected')
  expect(reloaded.discord?.bot).toEqual({ id: '123', username: 'synthetic-bot' })
  expect(reloaded.discord?.channel).toEqual({ id: '456', name: 'synthetic-channel' })
  expect(reloaded.discord?.fetchedAt).toBe(timestamp)
  expect(reloaded.discord?.xPostingEnabled).toBe(true)
  expect(reloaded.discord?.discordPostingEnabled).toBe(true)
  expect(reloaded.discord?.timelineNotificationsEnabled).toBe(true)
  expect(reloaded.discord?.settings).toBe(current.discord?.settings)
  expect(reloaded.discord?.configured).toBe(current.discord?.configured)
  expect(reloaded.discord?.notificationsEnabled).toBe(current.discord?.notificationsEnabled)
  expect(reloaded.webhook).toBe(current.webhook)
  expect(reloaded.webhook.model).toBe('clef-flash')
  const saved = contents.get(DISCORD_CONNECTION_CACHE_KEY)
  expect(saved).not.toContain('webhook')
  expect(saved).not.toContain('secretConfigured')
  expect(saved).not.toContain('xPostingEnabled')
  expect(saved).not.toContain('discordPostingEnabled')
  expect(saved).not.toContain('configured')
})

test('explicit connection hook persists the result and a fresh query client restores it without another probe', async () => {
  const initialClient = new QueryClient()
  const reloadedClient = new QueryClient()
  const captured: { connection: ReturnType<typeof useAdminBotConnection> | null } = { connection: null }
  const ConnectionProbe = () => {
    captured.connection = useAdminBotConnection()
    return null
  }
  const StatusProbe = () => {
    useAdminBotStatus()
    return null
  }
  const connection = spyOn(client, 'checkAdminBotConnection').mockImplementation(async () => checked())
  const read = spyOn(client, 'getAdminBotStatus').mockImplementation(async () => passive())
  try {
    renderToStaticMarkup(createElement(QueryClientProvider, { client: initialClient }, createElement(ConnectionProbe)))
    if (!captured.connection) throw new Error('Connection mutation unavailable')
    await captured.connection.mutateAsync()
    initialClient.clear()
    renderToStaticMarkup(createElement(QueryClientProvider, { client: reloadedClient }, createElement(StatusProbe)))
    const query = reloadedClient.getQueryCache().find({ queryKey: ADMIN_BOT_QUERY_KEY })
    if (!query) throw new Error('Status query unavailable')
    const result = AdminBotStatusSchema.safeParse(
      await reloadedClient.fetchQuery({ ...query.options, queryKey: ADMIN_BOT_QUERY_KEY })
    )
    if (!result.success) throw new Error('Invalid status result')
    expect(result.data.discord?.connection).toBe('connected')
    expect(result.data.discord?.fetchedAt).toBe(timestamp)
    expect(result.data.discord?.bot?.username).toBe('synthetic-bot')
    expect(connection).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledTimes(1)
    expect(query.options.meta).toEqual({ persist: false })
  } finally {
    initialClient.clear()
    reloadedClient.clear()
    connection.mockRestore()
    read.mockRestore()
  }
})

test('configuration changes discard an old connection check', () => {
  saveDiscordConnection(checked())
  const changed = passive({ ...passiveDiscord, configFingerprint: 'b'.repeat(64) })
  expect(restoreDiscordConnection(changed)).toBe(changed)
  expect(contents.has(DISCORD_CONNECTION_CACHE_KEY)).toBe(false)
})

test('confirmed missing or invalid settings discard previous connection results', () => {
  const results: AdminBotStatus[] = [
    passive({ ...passiveDiscord, configFingerprint: null, settings: { token: 'missing', channel: 'valid' } }),
    passive({ ...passiveDiscord, settings: { token: 'valid', channel: 'invalid' } })
  ]
  for (const result of results) {
    saveDiscordConnection(checked())
    expect(restoreDiscordConnection(result)).toBe(result)
    expect(contents.has(DISCORD_CONNECTION_CACHE_KEY)).toBe(false)
  }
})

test('temporary RPC outage never restores a result until the same valid configuration is available again', () => {
  const unavailable: AdminBotStatus[] = [
    { ...passive(), botConnected: false, error: 'rpc_unavailable' },
    { ...passive(), error: 'rpc_unavailable' },
    passive(null)
  ]
  for (const result of unavailable) {
    saveDiscordConnection(checked())
    const stored = contents.get(DISCORD_CONNECTION_CACHE_KEY)
    expect(restoreDiscordConnection(result)).toBe(result)
    saveDiscordConnection(result)
    expect(contents.get(DISCORD_CONNECTION_CACHE_KEY)).toBe(stored)
    const recovered = restoreDiscordConnection(passive())
    expect(recovered.discord?.connection).toBe('connected')
    expect(recovered.discord?.fetchedAt).toBe(timestamp)
  }
})

test('invalid JSON, schema and unchecked cache safely fall back to passive status', () => {
  const values = [
    'not json',
    '{}',
    JSON.stringify({ ...passiveDiscord }),
    JSON.stringify({ configFingerprint: fingerprint })
  ]
  for (const value of values) {
    contents.set(DISCORD_CONNECTION_CACHE_KEY, value)
    const current = passive()
    expect(restoreDiscordConnection(current)).toBe(current)
  }
})

test('blocked storage accessors never prevent rendering or connection checking', () => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get: () => {
      throw new Error('Storage blocked')
    }
  })
  expect(() => saveDiscordConnection(checked())).not.toThrow()
  const current = passive()
  expect(restoreDiscordConnection(current)).toBe(current)
})

test('throwing storage methods safely fall back without affecting the latest API result', () => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => {
        throw new Error('Read blocked')
      },
      setItem: () => {
        throw new Error('Write blocked')
      },
      removeItem: () => {
        throw new Error('Removal blocked')
      }
    }
  })
  expect(() => saveDiscordConnection(checked())).not.toThrow()
  const current = passive()
  expect(restoreDiscordConnection(current)).toBe(current)
  const missing = passive(null)
  expect(restoreDiscordConnection(missing)).toBe(missing)
})

test('new Discord network failure supersedes last connected result; RPC failure does not fabricate a result', () => {
  saveDiscordConnection(checked())
  const failed = passive({ ...passiveDiscord, connection: 'network', errorKind: 'network', fetchedAt: timestamp })
  saveDiscordConnection(failed)
  expect(restoreDiscordConnection(passive()).discord?.connection).toBe('network')
  saveDiscordConnection({ ...passive(null), botConnected: false, error: 'rpc_unavailable' })
  expect(restoreDiscordConnection(passive()).discord?.connection).toBe('network')
})
