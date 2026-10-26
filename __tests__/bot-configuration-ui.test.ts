import { describe, expect, spyOn, test } from 'bun:test'
import type { DiscordStatus } from '@biccame/shared/bot'
import { questionLabel } from '@biccame/shared/event-detect/answer-view'
import {
  FIELD_THRESHOLD_KEYS,
  type FieldThresholds,
  resolveFieldThresholds
} from '@biccame/shared/event-detect/detection'
import type { AdminBotStatus } from '@biccame/shared/schemas/admin-bot.dto'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { toast } from 'sonner'
import { BotManagement } from '@/components/admin/bot-management'
import { EDITABLE_FIELD_THRESHOLD_KEYS } from '@/components/admin/field-threshold-form'
import {
  ADMIN_BOT_QUERY_KEY,
  useAdminBotConfiguration,
  useAdminBotConnection,
  useAdminBotTest
} from '@/hooks/use-admin-bot'

import { client } from '@/utils/client'

const fetchedAt = '2026-10-14T00:00:00.000Z'
// 項目ごとに値を変えて、行の取り違えを検出できるようにする（status だけ共通値より低い既定値）。
const savedThresholds: FieldThresholds = {
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

const discordStatus = (setting: DiscordStatus['settings']['token']): DiscordStatus => ({
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
    for (const label of ['web Worker', 'Discord Token', '通知先チャンネル設定', '処理Queue']) {
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
    expectNeutral(markup, 'Discord 公開投稿', '無効')
    expect(markup).toContain('常時有効')
  })

  test.each(['missing', 'invalid'] as const)('設定%sは成功表示しない', async (setting) => {
    const markup = await renderSettings(discordStatus(setting), false)
    const text = setting === 'missing' ? '未設定' : '形式不正'
    expectNeutral(markup, 'Discord Token', text)
    expectNeutral(markup, '通知先チャンネル設定', text)
    expectNeutral(markup, '処理Queue', '未設定')
  })

  test('X投稿とDiscord公開投稿の有効フラグは設定確認の成功色と区別する', async () => {
    const markup = await renderSettings(
      { ...discordStatus('valid'), xPostingEnabled: true, discordPostingEnabled: true },
      true
    )
    for (const label of ['X 投稿', 'Discord 公開投稿']) {
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
    expectNeutral(markup, 'Discord 公開投稿', '未確認')
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

// 項目別の12項目と判定全体の3つのラベル（行のクラスを調べるときに使う）。
const EDITABLE_LABELS: readonly string[] = [
  ...EDITABLE_FIELD_THRESHOLD_KEYS.map((key) => questionLabel(key)),
  'イベント判定の登録閾値',
  '必須項目の選択閾値',
  '対象外判定の閾値'
]

describe('項目別のしきい値', () => {
  const percentOf = (value: number) => String(Math.round(value * 1000) / 10)

  test('12項目が、回答表の質問名と同じラベルで、質問の順に、保存済みの値を%で入力欄に出す', async () => {
    const markup = await renderSettings(discordStatus('valid'), true)
    // 保存・状態の形は12キー。画面の入力欄も同じ12項目（編集できるキーは FIELD_THRESHOLD_KEYS と同じ）。
    expect(FIELD_THRESHOLD_KEYS).toHaveLength(12)
    expect([...EDITABLE_FIELD_THRESHOLD_KEYS]).toEqual([...FIELD_THRESHOLD_KEYS])
    // 項目別の12項目に、判定全体の3つ（登録・必須項目の選択・対象外）を足した15個が入力欄。
    expect(markup.match(/data-slot="input"/g)).toHaveLength(15)
    const labels = EDITABLE_FIELD_THRESHOLD_KEYS.map((key) => questionLabel(key))
    expect(labels).toEqual([
      '状態',
      '配布物',
      '開催・配布店舗',
      '開催・配布店舗の確認',
      '対象ビッカメ娘',
      '対象ビッカメ娘の確認',
      '開始日',
      '終了日',
      '配布数',
      '配布条件',
      '購入額',
      '入金・チャージ額'
    ])
    // 並びは質問の順（項目別の見出しより後で、この順に出る）。
    const positions = labels.map((label) => markup.indexOf(`>${label}</dt>`))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(positions[0]).toBeGreaterThan(markup.indexOf('項目別の選択閾値'))
    for (const key of EDITABLE_FIELD_THRESHOLD_KEYS) {
      const label = questionLabel(key)
      const row = settingMarkup(markup, label)
      expect(row, key).toContain(`aria-label="${label}の閾値（%）"`)
      expect(row, key).toContain(`value="${percentOf(savedThresholds[key])}"`)
      expect(row, key).toContain('inputMode="decimal"')
      // 数値はラベルと同じフォント（等幅だと数字が上に寄る）の右寄せ。高さ32px・文字14pxで md でも拡大せず、行の中身は上下中央。
      expect(row, key).toContain('h-8 w-20 text-right text-sm tabular-nums')
      expect(row, key).not.toContain('font-mono')
      expect(row, key).not.toContain('md:h-10')
      expect(row, key).not.toContain('md:w-28')
      expect(row, key).not.toContain('md:text-base')
      expect(row, key).toContain('flex items-center')
      expect(row, key).not.toContain('aria-invalid="true"')
      expect(row, key).not.toContain('role="alert"')
    }
    // 状態は共通値より低い 80%、購入額は 82.5%、店舗・娘は 92% / 72% のように、行ごとに別の値が入る。
    expect(settingMarkup(markup, '状態')).toContain('value="80"')
    expect(settingMarkup(markup, '購入額')).toContain('value="82.5"')
    expect(settingMarkup(markup, '開催・配布店舗')).toContain('value="92"')
    expect(settingMarkup(markup, '対象ビッカメ娘')).toContain('value="72"')
    expect(settingMarkup(markup, '入金・チャージ額')).toContain('value="97"')
  })

  test('店舗・娘の行には、確認を省く条件を説明する補足を出し、確認の行には「はい」の条件を出す。他の項目には出さない', async () => {
    const markup = await renderSettings(discordStatus('valid'), true)
    const skip = 'この確率以上なら確認を省いて確定。未満なら「確認」の質問で決めます。'
    const yes = '「はい」の確率がこの値以上なら確定します。'
    for (const [label, key, note] of [
      ['開催・配布店舗', 'store', skip],
      ['開催・配布店舗の確認', 'store_confirm', yes],
      ['対象ビッカメ娘', 'character', skip],
      ['対象ビッカメ娘の確認', 'character_confirm', yes]
    ] as const) {
      const row = settingMarkup(markup, label)
      expect(row, label).toContain(note)
      expect(row, label).toContain(`aria-describedby="field-threshold-${key}-note"`)
      expect(row, label).toContain(`id="field-threshold-${key}-note"`)
    }
    expect(markup.split(skip)).toHaveLength(3)
    expect(markup.split(yes)).toHaveLength(3)
    for (const label of ['状態', '配布物', '開始日', '終了日', '配布数', '配布条件', '購入額', '入金・チャージ額'])
      expect(settingMarkup(markup, label), label).not.toContain('aria-describedby')
  })

  test('行は上揃えにし、ラベルは入力欄の高さの中で中央揃えにする（補足文・エラー文のある行でラベルがずれない）', async () => {
    const markup = await renderSettings(discordStatus('valid'), true)
    const rows = [...markup.matchAll(/<div class="grid[^"]*"><dt class="([^"]*)">([^<]*)<\/dt>/g)]
    const thresholdRows = rows.filter(([, , label]) => label.includes('閾値') || EDITABLE_LABELS.includes(label))
    expect(thresholdRows.length).toBeGreaterThanOrEqual(15)
    for (const [, labelClass, label] of thresholdRows) {
      expect(labelClass, label).toContain('sm:flex sm:h-8 sm:items-center')
    }
    const gridClasses = [...markup.matchAll(/<div class="(grid[^"]*)"><dt[^>]*>([^<]*)<\/dt>/g)]
    for (const [, gridClass, label] of gridClasses.filter(([, , text]) => EDITABLE_LABELS.includes(text)))
      expect(gridClass, label).toContain('sm:items-start')
  })

  test('判定全体の3つは読み取り専用の表示ではなく、保存済みの値を%で入れた入力欄になる', async () => {
    const markup = await renderSettings(discordStatus('valid'), true)
    const expected = [
      ['イベント判定の登録閾値', '90'],
      ['必須項目の選択閾値', '80'],
      ['対象外判定の閾値', '10']
    ] as const
    for (const [label, percent] of expected) {
      const row = settingMarkup(markup, label)
      expect(row, label).toContain('<input')
      expect(row, label).toContain('data-slot="input"')
      expect(row, label).toContain(`aria-label="${label}（%）"`)
      expect(row, label).toContain(`value="${percent}"`)
      expect(row, label).toContain('inputMode="decimal"')
      // 項目別と同じ見た目（ラベルと同じフォントの右寄せ、高さ32px・文字14pxで md でも拡大せず、行の中身は上下中央）。
      expect(row, label).toContain('h-8 w-20 text-right text-sm tabular-nums')
      expect(row, label).not.toContain('font-mono')
      expect(row, label).not.toContain('md:h-10')
      expect(row, label).not.toContain('md:text-base')
      expect(row, label).toContain('flex items-center')
      expect(row, label).not.toContain('disabled=""')
      expect(row, label).not.toContain('aria-invalid="true"')
      expect(row, label).not.toContain('role="alert"')
      // 読み取り専用の表示（90.0% のような 1 桁固定の文字列）は残さない。
      expect(row, label).not.toMatch(/\d+\.0%/)
    }
    // 3つの入力欄は、項目別の見出しより前（判定モデルの直後）に並ぶ。
    const heading = markup.indexOf('項目別の選択閾値')
    for (const [label] of expected) expect(markup.indexOf(`>${label}</dt>`)).toBeLessThan(heading)
    expect(markup.indexOf('>イベント判定の登録閾値</dt>')).toBeLessThan(markup.indexOf('>必須項目の選択閾値</dt>'))
    expect(markup.indexOf('>必須項目の選択閾値</dt>')).toBeLessThan(markup.indexOf('>対象外判定の閾値</dt>'))
  })

  test('必須項目の選択閾値の入力欄の近くに、項目別が優先されることを説明する補足を出す', async () => {
    const markup = await renderSettings(discordStatus('valid'), true)
    const note =
      '項目別の閾値を保存済みの場合、各項目は項目別の値が優先されます。ここは配布物の種類数の確認と、項目別の閾値が未保存のときの既定値に使われます。'
    const row = settingMarkup(markup, '必須項目の選択閾値')
    expect(row).toContain(note)
    // 入力欄の説明として関連付ける。
    expect(row).toContain('aria-describedby="field-threshold-choiceThreshold-note"')
    expect(row).toContain('id="field-threshold-choiceThreshold-note"')
    // 補足は必須項目の選択閾値の行だけに出す。
    expect(markup.split(note)).toHaveLength(2)
    expect(settingMarkup(markup, 'イベント判定の登録閾値')).not.toContain('aria-describedby')
    expect(settingMarkup(markup, '対象外判定の閾値')).not.toContain('aria-describedby')
  })

  test('注意書きに、過去の判定結果は変わらず再判定が必要であることを出す', async () => {
    const markup = await renderSettings(discordStatus('valid'), true)
    expect(markup).toContain(
      'しきい値を変えても、過去の判定結果は変わりません。反映するには「再実行」を実行してください。'
    )
  })

  test('変更前は保存が無効で、ボタンは常に同じフッターに出ている', async () => {
    const markup = await renderSettings(discordStatus('valid'), true)
    expect(markup).toMatch(/<footer[^>]*><button[^>]*disabled=""[^>]*>保存<\/button><\/footer>/)
  })

  test('outline のボタンは枠線に共通テーマ色（border-card-border）を指定する', async () => {
    const markup = await renderSettings(discordStatus('valid'), true)
    const outlined = [...markup.matchAll(/<(?:button|a)\b[^>]*data-variant="outline"[^>]*>/g)].map((match) => match[0])
    // 接続確認（button）と受信履歴（asChild の a）。
    expect(outlined).toHaveLength(2)
    for (const tag of outlined) expect(tag).toContain('border-card-border')
  })

  test('左上の戻るリンクは従来どおり管理画面（/admin）を指す', async () => {
    const markup = await renderSettings(discordStatus('valid'), true)
    const anchors = [...markup.matchAll(/<a\b[^>]*>.*?<\/a>/g)].map((match) => match[0])
    const back = anchors.find((anchor) => anchor.includes('管理画面に戻る'))
    expect(back).toBeDefined()
    expect(back).toContain('href="/admin"')
    expect(markup).not.toContain('受信履歴に戻る')
    // 下の「受信履歴」ボタンは受信履歴（/admin/webhooks）への入口として残る。
    const history = anchors.find((anchor) => anchor.includes('受信履歴'))
    expect(history).toBeDefined()
    expect(history).toContain('href="/admin/webhooks"')
  })
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
  const editedThresholds: FieldThresholds = { ...savedThresholds, status: 0.7, start_date: 0.99 }
  // 判定全体の3つ。初期値（0.9 / 0.5 / 0.9）と全て違う値にして、反映漏れを検出する。
  const editedEvent = { eventThreshold: 0.95, ignoreThreshold: 0.3, choiceThreshold: 0.85 }
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
      choiceThreshold: 0.9,
      fieldThresholds: savedThresholds
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
  // 保存 API と同じく、応答は常に全項目（足りない項目は既定値）にする。
  const save = spyOn(client, 'saveAdminBotConfiguration').mockImplementation(async (body) => ({
    ...body,
    fieldThresholds: resolveFieldThresholds(body.thresholds.choiceThreshold, body.fieldThresholds)
  }))
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
    await captured.mutation.mutateAsync({
      model: 'clef-flash',
      thresholds: editedEvent,
      fieldThresholds: editedThresholds
    })
    expect(save).toHaveBeenCalledWith({
      model: 'clef-flash',
      thresholds: editedEvent,
      fieldThresholds: editedThresholds
    })
    expect(successToast).toHaveBeenCalledTimes(1)
    expect(successToast).toHaveBeenCalledWith('保存しました')
    expect(queryClient.getQueryData<AdminBotStatus>(ADMIN_BOT_QUERY_KEY)?.webhook.model).toBe('clef-flash')
    expect(queryClient.getQueryData<AdminBotStatus>(ADMIN_BOT_QUERY_KEY)?.webhook.fieldThresholds).toEqual(
      editedThresholds
    )
    // 判定全体の3つも、保存した値でキャッシュを更新する（詳細画面の回答表が即座に新しい値で出る）。
    expect(queryClient.getQueryData<AdminBotStatus>(ADMIN_BOT_QUERY_KEY)?.webhook).toMatchObject(editedEvent)
    expect(queryClient.getQueryState(ADMIN_BOT_QUERY_KEY)?.isInvalidated).toBe(false)
    expect(read).not.toHaveBeenCalled()
    if (captured.connection === null || captured.notification === null) throw new Error('Bot mutations unavailable')
    await captured.connection.mutateAsync()
    expect(connection).toHaveBeenCalledTimes(1)
    expect(queryClient.getQueryData<AdminBotStatus>(ADMIN_BOT_QUERY_KEY)?.discord?.connection).toBe('connected')
    expect(queryClient.getQueryData<AdminBotStatus>(ADMIN_BOT_QUERY_KEY)?.webhook.model).toBe('clef-flash')
    // 接続確認の応答は保存前の古いしきい値を返す（KV の読み戻し）ため、画面にある保存値（3つと項目別）を引き継ぐ。
    expect(queryClient.getQueryData<AdminBotStatus>(ADMIN_BOT_QUERY_KEY)?.webhook.fieldThresholds).toEqual(
      editedThresholds
    )
    expect(queryClient.getQueryData<AdminBotStatus>(ADMIN_BOT_QUERY_KEY)?.webhook).toMatchObject(editedEvent)
    await captured.notification.mutateAsync()
    expect(notification).toHaveBeenCalledTimes(1)
    expect(queryClient.getQueryData<AdminBotStatus>(ADMIN_BOT_QUERY_KEY)?.webhook.model).toBe('clef-flash')
    expect(invalidate).not.toHaveBeenCalled()
    expect(read).not.toHaveBeenCalled()
    save.mockImplementation(async () => {
      throw new Error('Synthetic save failure')
    })
    await expect(
      captured.mutation.mutateAsync({
        model: 'clef',
        thresholds: { eventThreshold: 0.9, ignoreThreshold: 0.5, choiceThreshold: 0.9 },
        fieldThresholds: savedThresholds
      })
    ).rejects.toThrow('Synthetic save failure')
    expect(save).toHaveBeenCalledTimes(2)
    expect(successToast).toHaveBeenCalledTimes(1)
    expect(errorToast).toHaveBeenCalledTimes(1)
    expect(errorToast).toHaveBeenCalledWith('保存できませんでした')
    expect(queryClient.getQueryData<AdminBotStatus>(ADMIN_BOT_QUERY_KEY)?.webhook.model).toBe('clef-flash')
    // 保存に失敗しても、表示中の値（直前に保存できた値）は元に戻さない。
    expect(queryClient.getQueryData<AdminBotStatus>(ADMIN_BOT_QUERY_KEY)?.webhook.fieldThresholds).toEqual(
      editedThresholds
    )
    expect(queryClient.getQueryData<AdminBotStatus>(ADMIN_BOT_QUERY_KEY)?.webhook).toMatchObject(editedEvent)
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
