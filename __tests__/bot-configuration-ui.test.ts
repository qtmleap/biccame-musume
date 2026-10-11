import { describe, expect, spyOn, test } from 'bun:test'
import type { DiscordStatus } from '@biccame/shared/bot'
import type { AdminBotStatus } from '@biccame/shared/schemas/admin-bot.dto'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { toast } from 'sonner'
import { BotManagement } from '@/components/admin/bot-management'
import {
  ADMIN_BOT_QUERY_KEY,
  useAdminBotConfiguration,
  useAdminBotConnection,
  useAdminBotTest
} from '@/hooks/use-admin-bot'

import { client } from '@/utils/client'

const fetchedAt = '2026-10-14T00:00:00.000Z'

const discordStatus = (setting: DiscordStatus['settings']['token']): DiscordStatus => ({
  configFingerprint: setting === 'valid' ? 'a'.repeat(64) : null,
  configured: { token: setting === 'valid', channel: setting === 'valid' },
  settings: { token: setting, channel: setting },
  notificationsEnabled: true,
  xPostingEnabled: false,
  timelineNotificationsEnabled: false,
  connection: 'unchecked',
  bot: null,
  channel: null,
  sendPermission: 'unknown',
  errorKind: null,
  fetchedAt
})

const renderSettings = async (discord: DiscordStatus | null, configured: boolean) => {
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
      choiceThreshold: 0.8
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

const settingMarkup = (markup: string, label: string) => {
  const value = markup.match(new RegExp(`<dt[^>]*>${label}</dt><dd[^>]*>(.*?)</dd>`))?.[1]
  expect(value).toBeDefined()
  return value
}

const expectNeutral = (markup: string, label: string, text: string) => {
  const setting = settingMarkup(markup, label)
  expect(setting).toContain(text)
  expect(setting).not.toContain('text-status-ongoing-foreground')
  expect(setting).not.toContain('lucide-circle-check')
}

describe('Bot設定の成功表示', () => {
  test('形式確認済み設定と配置済みQueueは緑色のチェックを表示する', async () => {
    const markup = await renderSettings(discordStatus('valid'), true)
    for (const label of ['Service Binding', 'Discord Token', '通知先チャンネル設定', '処理Queue']) {
      const setting = settingMarkup(markup, label)
      expect(setting).toContain('設定済み')
      expect(setting).not.toContain('形式確認済み')
      expect(setting).toContain('text-status-ongoing-foreground')
      expect(setting).toContain('lucide-circle-check')
      expect(setting).toContain('aria-hidden="true"')
    }
    expect(markup.match(/text-status-ongoing-foreground/g)).toHaveLength(5)
    expectNeutral(markup, 'Discord 接続状態', '未確認')
    expectNeutral(markup, '送信権限', '未確認')
    expectNeutral(markup, 'X 投稿', '無効')
    expectNeutral(markup, 'タイムライン通知', '無効')
    expect(markup).toContain('常時有効')
  })

  test.each(['missing', 'invalid'] as const)('設定%sは成功表示しない', async (setting) => {
    const markup = await renderSettings(discordStatus(setting), false)
    const text = setting === 'missing' ? '未設定' : '形式不正'
    expectNeutral(markup, 'Discord Token', text)
    expectNeutral(markup, '通知先チャンネル設定', text)
    expectNeutral(markup, '処理Queue', '未設定')
  })

  test('X投稿とタイムラインの有効フラグは設定確認の成功色と区別する', async () => {
    const markup = await renderSettings(
      { ...discordStatus('valid'), xPostingEnabled: true, timelineNotificationsEnabled: true },
      true
    )
    for (const label of ['X 投稿', 'タイムライン通知']) {
      const setting = settingMarkup(markup, label)
      expect(setting).toContain('有効')
      expect(setting).not.toContain('text-status-ongoing-foreground')
    }
  })

  test('取得不能な設定を未設定や成功へ変換しない', async () => {
    const markup = await renderSettings(null, false)
    expectNeutral(markup, 'Discord Token', '設定を取得できない')
    expectNeutral(markup, '通知先チャンネル設定', '設定を取得できない')
    expectNeutral(markup, 'Discord 接続状態', '設定を取得できない')
    expectNeutral(markup, 'X 投稿', '未確認')
    expectNeutral(markup, 'タイムライン通知', '未確認')
  })

  test('接続や送信権限の失敗は成功色を使わない', async () => {
    const markup = await renderSettings(
      { ...discordStatus('valid'), connection: 'authorization', sendPermission: 'denied' },
      true
    )
    expectNeutral(markup, 'Discord 接続状態', 'チャンネルへのアクセス不可')
    expectNeutral(markup, '送信権限', '送信権限なし')
  })

  test('接続成功は設定形式の成功とは区別した文言で表示する', async () => {
    const markup = await renderSettings(
      { ...discordStatus('valid'), connection: 'connected', sendPermission: 'allowed' },
      true
    )
    const connection = settingMarkup(markup, 'Discord 接続状態')
    expect(connection).toContain('認証・チャンネルアクセス成功')
    expect(connection).toContain('text-status-ongoing-foreground')
    expect(connection).toContain('lucide-circle-check')
    expect(connection).not.toContain('形式確認済み')
  })
})

test('保存は黒い既定色ではなくブランド色の塗りボタンを使う', async () => {
  const markup = await renderSettings(discordStatus('valid'), true)
  const saveButton = [...markup.matchAll(/<button\b[^>]*>.*?<\/button>/g)].find((match) =>
    match[0].includes('>保存</button>')
  )?.[0]
  expect(saveButton).toBeDefined()
  expect(saveButton).toContain('bg-brand')
  expect(saveButton).toContain('text-brand-foreground')
  expect(saveButton).not.toContain('bg-primary')
})

test('送信テストは黒い既定色ではなくブランド色の塗りボタンを使う', async () => {
  const markup = await renderSettings(discordStatus('valid'), true)
  const sendButton = [...markup.matchAll(/<button\b[^>]*>.*?<\/button>/g)].find((match) =>
    match[0].includes('送信テスト')
  )?.[0]
  expect(sendButton).toBeDefined()
  expect(sendButton).toContain('data-variant="default"')
  expect(sendButton).toContain('bg-brand')
  expect(sendButton).toContain('text-brand-foreground')
  expect(sendButton).toContain('hover:bg-brand/90')
  expect(sendButton).not.toContain('bg-primary')
})

test('model selection stays in its row and unchanged save stays disabled in the footer', async () => {
  const markup = await renderSettings(discordStatus('valid'), true)
  const model = settingMarkup(markup, '判定モデル')
  expect(model).toContain('role="combobox"')
  expect(model).toContain('aria-label="判定モデル"')
  expect(model).not.toContain('保存')
  expect(markup).toMatch(/<footer[^>]*><button[^>]*disabled=""[^>]*>保存<\/button><\/footer>/)
  expect(markup.indexOf('<footer')).toBeGreaterThan(markup.indexOf('受信履歴'))
  expect(markup).not.toContain('保存しました')
})

test('save stays visible and disabled before settings have loaded', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const routeTree = createRootRoute({ component: BotManagement })
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  try {
    await router.load()
    const markup = renderToStaticMarkup(
      createElement(QueryClientProvider, { client: queryClient }, createElement(RouterProvider, { router }))
    )
    expect(markup).toContain('設定を取得しています。')
    expect(markup).toMatch(/<footer[^>]*><button[^>]*disabled=""[^>]*>保存<\/button><\/footer>/)
  } finally {
    queryClient.clear()
  }
})

test('model save uses the typed payload and updates cached model without stale readback', async () => {
  const queryClient = new QueryClient()
  const initial: AdminBotStatus = {
    fetchedAt,
    botConnected: false,
    discord: null,
    error: null,
    webhook: {
      configured: true,
      queueConfigured: true,
      model: 'clef',
      eventThreshold: 0.9,
      ignoreThreshold: 0.5,
      choiceThreshold: 0.9
    }
  }
  queryClient.setQueryData(ADMIN_BOT_QUERY_KEY, initial)
  const captured: {
    mutation: ReturnType<typeof useAdminBotConfiguration> | null
    connection: ReturnType<typeof useAdminBotConnection> | null
    notification: ReturnType<typeof useAdminBotTest> | null
  } = { mutation: null, connection: null, notification: null }
  const Probe = () => {
    captured.mutation = useAdminBotConfiguration()
    captured.connection = useAdminBotConnection()
    captured.notification = useAdminBotTest()
    return null
  }
  const save = spyOn(client, 'saveAdminBotConfiguration').mockImplementation(async (body) => ({ model: body.model }))
  const read = spyOn(client, 'getAdminBotStatus').mockImplementation(async () => initial)
  const connection = spyOn(client, 'checkAdminBotConnection').mockImplementation(async () => ({
    ...initial,
    botConnected: true,
    discord: { ...discordStatus('valid'), connection: 'connected' }
  }))
  const notification = spyOn(client, 'testAdminBotNotification').mockImplementation(async () => ({
    status: 'sent',
    messageId: 'synthetic-message-id'
  }))
  const invalidate = spyOn(queryClient, 'invalidateQueries')
  const successToast = spyOn(toast, 'success')
  const errorToast = spyOn(toast, 'error')
  try {
    renderToStaticMarkup(createElement(QueryClientProvider, { client: queryClient }, createElement(Probe)))
    if (captured.mutation === null) throw new Error('Configuration mutation unavailable')
    await captured.mutation.mutateAsync({ model: 'clef-flash' })
    expect(save).toHaveBeenCalledWith({ model: 'clef-flash' })
    expect(successToast).toHaveBeenCalledTimes(1)
    expect(successToast).toHaveBeenCalledWith('保存しました')
    expect(queryClient.getQueryData<AdminBotStatus>(ADMIN_BOT_QUERY_KEY)?.webhook.model).toBe('clef-flash')
    expect(queryClient.getQueryState(ADMIN_BOT_QUERY_KEY)?.isInvalidated).toBe(false)
    expect(read).not.toHaveBeenCalled()
    if (captured.connection === null || captured.notification === null) throw new Error('Bot mutations unavailable')
    await captured.connection.mutateAsync()
    expect(connection).toHaveBeenCalledTimes(1)
    expect(queryClient.getQueryData<AdminBotStatus>(ADMIN_BOT_QUERY_KEY)?.discord?.connection).toBe('connected')
    expect(queryClient.getQueryData<AdminBotStatus>(ADMIN_BOT_QUERY_KEY)?.webhook.model).toBe('clef-flash')
    await captured.notification.mutateAsync()
    expect(notification).toHaveBeenCalledTimes(1)
    expect(queryClient.getQueryData<AdminBotStatus>(ADMIN_BOT_QUERY_KEY)?.webhook.model).toBe('clef-flash')
    expect(invalidate).not.toHaveBeenCalled()
    expect(read).not.toHaveBeenCalled()
    save.mockImplementation(async () => {
      throw new Error('Synthetic save failure')
    })
    await expect(captured.mutation.mutateAsync({ model: 'clef' })).rejects.toThrow('Synthetic save failure')
    expect(save).toHaveBeenCalledTimes(2)
    expect(successToast).toHaveBeenCalledTimes(1)
    expect(errorToast).toHaveBeenCalledTimes(1)
    expect(errorToast).toHaveBeenCalledWith('保存できませんでした')
    expect(queryClient.getQueryData<AdminBotStatus>(ADMIN_BOT_QUERY_KEY)?.webhook.model).toBe('clef-flash')
  } finally {
    save.mockRestore()
    read.mockRestore()
    connection.mockRestore()
    notification.mockRestore()
    invalidate.mockRestore()
    successToast.mockRestore()
    errorToast.mockRestore()
    queryClient.clear()
  }
})
