import { expect } from 'bun:test'
import type { DiscordStatus } from '@biccame/shared/bot'
import type { FieldThresholds } from '@biccame/shared/event-detect/detection'
import type { AdminBotStatus } from '@biccame/shared/schemas/admin-bot.dto'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BotManagement } from '@/components/admin/bot-management'
import { ADMIN_BOT_QUERY_KEY } from '@/hooks/use-admin-bot'

export const fetchedAt = '2026-10-14T00:00:00.000Z'
// 項目ごとに値を変えて、行の取り違えを検出できるようにする（status だけ共通値より低い既定値）。
export const savedThresholds: FieldThresholds = {
  status: 0.8,
  category: 0.91,
  store: 0.92,
  store_confirm: 0.71,
  character: 0.72,
  character_confirm: 0.73,
  start_date: 0.93,
  end_date: 0.94,
  quantity: 0.95,
  condition: 0.96,
  purchase_amount: 0.825,
  charge_amount: 0.97
}

export const discordStatus = (setting: DiscordStatus['settings']['token']): DiscordStatus => ({
  configFingerprint: setting === 'valid' ? 'a'.repeat(64) : null,
  configured: { token: setting === 'valid', channel: setting === 'valid' },
  settings: { token: setting, channel: setting },
  notificationsEnabled: true,
  xPostingEnabled: false,
  discordPostingEnabled: false,
  timelineNotificationsEnabled: false,
  connection: 'unchecked',
  bot: null,
  channel: null,
  sendPermission: 'unknown',
  errorKind: null,
  fetchedAt
})

export const renderSettings = async (discord: DiscordStatus | null, configured: boolean) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const status: AdminBotStatus = {
    fetchedAt,
    botConnected: discord !== null,
    discord,
    webhook: {
      configured,
      queueConfigured: configured,
      model: 'clef',
      eventThreshold: 0.9,
      ignoreThreshold: 0.1,
      choiceThreshold: 0.8,
      fieldThresholds: savedThresholds
    },
    error: null
  }
  queryClient.setQueryData(ADMIN_BOT_QUERY_KEY, status)
  const routeTree = createRootRoute({ component: BotManagement })
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  try {
    await router.load()
    return renderToStaticMarkup(
      createElement(QueryClientProvider, { client: queryClient }, createElement(RouterProvider, { router }))
    )
  } finally {
    queryClient.clear()
  }
}

export const settingMarkup = (markup: string, label: string) => {
  const value = markup.match(new RegExp(`<dt[^>]*>${label}</dt><dd[^>]*>(.*?)</dd>`))?.[1]
  expect(value).toBeDefined()
  return value
}
