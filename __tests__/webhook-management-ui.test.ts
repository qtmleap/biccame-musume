import { describe, expect, test } from 'bun:test'
import { StoreDataSchema } from '@biccame/shared/schemas/store.dto'
import { type WebhookJob, WebhookNotificationStatusSchema } from '@biccame/shared/schemas/webhook.dto'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebhookJobList } from '@/components/admin/webhook-job-list'
import {
  detectionScoreLabel,
  notificationRetryWarning,
  webhookAccountLabel,
  webhookActionAvailability,
  webhookJobLabel,
  webhookKeywordLabel,
  webhookNotificationLabel
} from '@/components/admin/webhook-labels'
import { WebhookStatusBadge } from '@/components/admin/webhook-status-badge'
import { ADMIN_WEBHOOK_QUERY_KEY } from '@/hooks/use-admin-webhooks'
import { charactersQueryKey } from '@/hooks/use-characters'
import { adminEndpoints } from '@/utils/client/admin'
import canonicalCharacters from '../workers/web/public/characters.json'

const characters = (() => {
  const parsed = StoreDataSchema.array().safeParse(canonicalCharacters)
  if (!parsed.success) throw new Error('Invalid canonical character fixture')
  return parsed.data
})()

const listJob: WebhookJob = {
  postId: '1000000000000000001',
  post: {
    id: '1000000000000000001',
    createdAt: '2026-10-02T03:00:00.000Z',
    screenName: 'synthetic_account',
    kind: 'original',
    text: '一覧に表示しない投稿本文',
    url: 'https://example.invalid/post/1000000000000000001',
    media: []
  },
  sourceUrl: 'https://example.invalid/post/1000000000000000001',
  eventUUID: '550e8400-e29b-41d4-a716-446655440001',
  status: 'held',
  reasons: [],
  candidate: null,
  confidence: 0.72,
  model: 'clef-flash',
  questionVersion: 'test-v1',
  eventId: '550e8400-e29b-41d4-a716-446655440000',
  eventTitle: '紐付け先の実イベント名',
  postStatus: 'ongoing',
  attempts: 7,
  notificationStatus: 'unknown',
  notificationId: null,
  notificationError: null,
  notificationAttempts: 1,
  lastError: null,
  createdAt: '2026-10-05T03:00:00.000Z',
  updatedAt: '2026-10-05T03:00:00.000Z',
  judgedAt: null
}

const renderList = async (jobs: WebhookJob[]) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData([...ADMIN_WEBHOOK_QUERY_KEY, 'list', null], { jobs, nextCursor: null })
  queryClient.setQueryData(charactersQueryKey, characters)
  const routeTree = createRootRoute({ component: WebhookJobList })
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

describe('Webhook管理画面の判定・通知表示', () => {
  test('受信履歴は7列でキーワード判定とモデル、精度、投稿状態を別々に表示する', async () => {
    const markup = await renderList([listJob])
    expect([...markup.matchAll(/<th\b[^>]*>(.*?)<\/th>/g)].map((match) => match[1])).toEqual([
      'アカウント',
      '日時',
      '判定',
      'モデル',
      '精度',
      'ステータス',
      'イベント名'
    ])
    expect([...markup.matchAll(/<td\b/g)]).toHaveLength(7)
    expect(markup).toContain('@synthetic_account')
    expect(markup).toContain('2026/10/02')
    const dateCell = [...markup.matchAll(/<td\b[^>]*>.*?<\/td>/g)].find((match) => match[0].includes('2026/10/02'))
    expect(dateCell?.[0]).toContain('tabular-nums')
    expect(dateCell?.[0]).not.toContain('text-xs')
    expect(markup).not.toContain('2026/10/05')
    expect(markup).toContain('継続')
    expect(markup).toContain('72.0%')
    expect(markup).toContain('clef-flash')
    expect([...markup.matchAll(/\d+\.\d%/g)]).toHaveLength(1)
    expect(markup).toContain(`href="/events/${listJob.eventId}"`)
    expect(markup).toContain('紐付け先の実イベント名')
    expect(markup).not.toContain(`/events/${listJob.eventUUID}`)
    for (const hidden of ['一覧に表示しない投稿本文', '処理回数', 'Discord通知', '詳細', '保留', '送信結果不明']) {
      expect(markup).not.toContain(hidden)
    }
    expect(markup).toContain('border-separator')
    expect(markup).toMatch(/<table\b[^>]*class="[^"]*whitespace-nowrap/)
    expect(markup).toContain('title="現在のキーワードルールによる判定"')
  })

  test('登録済みアカウントはキャラクター名を表示し投稿リンクを維持する', async () => {
    const markup = await renderList([{ ...listJob, post: { ...listJob.post, screenName: 'BIC_ABENO' } }])
    expect(markup).toContain('あべのたん')
    expect(markup).not.toContain('@BIC_ABENO')
    expect(markup).toContain(`href="${listJob.sourceUrl}"`)
    expect(webhookAccountLabel('bic_abeno', characters)).toBe('あべのたん')
    expect(webhookAccountLabel('synthetic_account', characters)).toBe('@synthetic_account')
    const storeAccount = characters.find((entry) => !entry.character.is_biccame_musume && entry.character.twitter_id)
    if (storeAccount === undefined || storeAccount.character.twitter_id === undefined)
      throw new Error('Missing canonical non-character account fixture')
    expect(webhookAccountLabel(storeAccount.character.twitter_id, characters)).toBe(
      storeAccount.store?.name === undefined ? storeAccount.character.name : storeAccount.store.name
    )
  })

  test.each([
    ['announce', '告知'],
    ['start', '開始'],
    ['ongoing', '継続'],
    ['end', '終了'],
    [null, '—']
  ] as const)('投稿状態%sを処理状態から推測せず表示する', async (postStatus, label) => {
    const markup = await renderList([{ ...listJob, postStatus, model: 'clef', confidence: 0 }])
    expect(markup).toContain(`>${label}</td>`)
    expect(markup).toContain('0.0%')
    expect(markup).toContain('clef')
    expect(markup).not.toContain('clef-flash')
  })

  test.each(['announce', 'start', 'ongoing', 'end', null] as const)(
    '対象外判定はAIの投稿状態%sより却下を優先する',
    async (postStatus) => {
      const markup = await renderList([
        { ...listJob, status: 'ignored', postStatus, confidence: 0.038, eventId: null, eventTitle: null }
      ])
      expect(markup).toContain('>却下</td>')
      expect(markup).toContain('3.8%')
      expect(markup).not.toContain('>継続</td>')
      expect(markup).not.toContain('href="/events/')
    }
  )

  test('キーワード一致はAIの対象外判定と独立して表示する', async () => {
    const post = {
      ...listJob.post,
      screenName: 'bicpkanhonten',
      text: 'カタログギフトをプレゼント。無くなり次第終了！'
    }
    expect(webhookKeywordLabel(post)).toBe('一致')
    const markup = await renderList([
      { ...listJob, post, status: 'ignored', confidence: 0.038, eventId: null, eventTitle: null }
    ])
    expect(markup).toContain('>一致</td>')
    expect(markup).toContain('>clef-flash</td>')
    expect(markup).toContain('>却下</td>')
    expect(webhookKeywordLabel({ ...post, text: '本日は晴れです' })).toBe('不一致')
    expect(webhookKeywordLabel({ ...post, text: 'PCのキャンペーン終了' })).toBe('除外')
    expect(webhookKeywordLabel({ ...post, kind: 'retweet' })).toBe('除外')
    expect(webhookKeywordLabel({ ...post, screenName: 'synthetic_account' })).toBe('除外')
    expect(webhookKeywordLabel({ ...post, text: 'PCの名刺配布' })).toBe('一致')
    expect(markup).not.toContain('一致:')
  })

  test('未判定とイベント未紐付けには確率やリンクを捏造しない', async () => {
    const markup = await renderList([
      { ...listJob, postStatus: null, confidence: null, model: null, eventId: null, eventTitle: null }
    ])
    const cells = [...markup.matchAll(/<td\b[^>]*>(.*?)<\/td>/g)].map((match) => match[1])
    expect(cells.slice(3)).toEqual(['—', '—', '—', '—'])
    expect(markup).not.toContain('未判定')
    const precisionCell = [...markup.matchAll(/<td\b[^>]*>.*?<\/td>/g)][4]?.[0]
    expect(precisionCell).not.toContain('font-mono')
    expect(precisionCell).not.toContain('tabular-nums')
    expect(markup).not.toMatch(/\d+\.\d%/)
    expect(markup).not.toContain('href="/events/')
    expect(markup).not.toContain(listJob.eventUUID)
  })

  test('空状態は7列をまたぐ', async () => {
    const markup = await renderList([])
    expect(markup).toContain('colSpan="7"')
    expect(markup).toContain('受信履歴はありません。')
  })

  test('接続状態はGET、実送信・保留解決・再試行はPOSTを使う', () => {
    expect(adminEndpoints.find((endpoint) => endpoint.alias === 'getAdminBotStatus')?.method).toBe('get')
    expect(adminEndpoints.find((endpoint) => endpoint.alias === 'checkAdminBotConnection')?.method).toBe('post')
    expect(adminEndpoints.find((endpoint) => endpoint.alias === 'testAdminBotNotification')?.method).toBe('post')
    expect(adminEndpoints.find((endpoint) => endpoint.alias === 'retryAdminWebhookJob')?.method).toBe('post')
    expect(adminEndpoints.find((endpoint) => endpoint.alias === 'resolveAdminWebhookJob')?.method).toBe('post')
  })

  test('受信履歴のクライアントパスは管理APIの経路に一致する', () => {
    expect(adminEndpoints.find((endpoint) => endpoint.alias === 'listAdminWebhookJobs')?.path).toBe(
      '/api/admin/webhook/jobs'
    )
    expect(adminEndpoints.find((endpoint) => endpoint.alias === 'getAdminWebhookJob')?.path).toBe(
      '/api/admin/webhook/jobs/:postId'
    )
  })

  test('処理状態と通知状態を別々に表示する', () => {
    expect(webhookJobLabel('registered')).toBe('登録済み')
    expect(webhookNotificationLabel('failed')).toBe('通知失敗')
    expect(webhookJobLabel('held')).toBe('保留')
    expect(webhookNotificationLabel('unknown')).toBe('送信結果不明')
  })

  test.each(WebhookNotificationStatusSchema.options)('通知状態%sに表示ラベルがある', (status) => {
    expect(webhookNotificationLabel(status)).not.toBe(status)
  })

  test('通知対象外は中立色を使い、再送可能にしない', () => {
    const markup = renderToStaticMarkup(createElement(WebhookStatusBadge, { status: 'skipped', notification: true }))
    expect(markup).toContain('通知対象外')
    expect(markup).toContain('bg-muted/40')
    expect(markup).toContain('text-muted-foreground')
    expect(markup).not.toContain('bg-status-ongoing')
    expect(webhookActionAvailability('held', 'skipped').canRetryNotification).toBe(false)
  })

  test('未判定と低スコアを区別する', () => {
    expect(detectionScoreLabel(null)).toBe('—')
    expect(detectionScoreLabel(0)).toBe('0.0%')
    expect(detectionScoreLabel(0.9)).toBe('90.0%')
  })

  test('未知の状態は成功に変換しない', () => {
    expect(webhookJobLabel('future_state')).toBe('future_state')
    expect(webhookNotificationLabel('future_state')).toBe('future_state')
  })

  test('登録後の通知失敗では判定・登録の再実行を許可しない', () => {
    expect(webhookActionAvailability('registered', 'failed')).toEqual({
      canResolve: false,
      canRetryProcessing: false,
      canRetryNotification: true
    })
  })

  test('保留の解決と失敗した判定の再実行を区別する', () => {
    expect(webhookActionAvailability('held', 'sent').canResolve).toBe(true)
    expect(webhookActionAvailability('failed', 'pending').canRetryProcessing).toBe(true)
    expect(webhookActionAvailability('processing', 'unknown').canRetryNotification).toBe(false)
    expect(webhookActionAvailability('ignored', 'sent').canResolve).toBe(false)
  })

  test('結果不明の再送は重複の危険を明示する', () => {
    expect(notificationRetryWarning('unknown')).toContain('重複')
    expect(notificationRetryWarning('failed')).toContain('AI判定は繰り返しません')
  })
})
