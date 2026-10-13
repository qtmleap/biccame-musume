import { describe, expect, test } from 'bun:test'
import type { ClefAnswer } from '@biccame/shared/event-detect/clef'
import type { AdminBotStatus } from '@biccame/shared/schemas/admin-bot.dto'
import type { EventRequest } from '@biccame/shared/schemas/event.dto'
import { StoreDataSchema } from '@biccame/shared/schemas/store.dto'
import { type WebhookJob, WebhookNotificationStatusSchema } from '@biccame/shared/schemas/webhook.dto'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebhookAnswerTable } from '@/components/admin/webhook-answer-table'
import { webhookResolveDefaultValues } from '@/components/admin/webhook-form-defaults'
import { WebhookJobDetail } from '@/components/admin/webhook-job-detail'
import { WebhookJobList } from '@/components/admin/webhook-job-list'
import {
  detectionScoreLabel,
  notificationRetryWarning,
  webhookAccountLabel,
  webhookActionAvailability,
  webhookJobLabel,
  webhookKeywordLabel,
  webhookNotificationLabel,
  webhookPostStatusIsTentative,
  webhookPostStatusLabel
} from '@/components/admin/webhook-labels'
import { WebhookStatusBadge } from '@/components/admin/webhook-status-badge'
import { ADMIN_BOT_QUERY_KEY } from '@/hooks/use-admin-bot'
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
  postStatusProbability: 0.99,
  answers: null,
  draft: null,
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

const botStatus = (choiceThreshold: number): AdminBotStatus => ({
  fetchedAt: '2026-10-05T03:00:00.000Z',
  botConnected: true,
  discord: null,
  webhook: {
    configured: true,
    queueConfigured: true,
    model: 'clef',
    eventThreshold: 0.9,
    ignoreThreshold: 0.5,
    choiceThreshold
  },
  error: null
})

const renderList = async (jobs: WebhookJob[], choiceThreshold?: number) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData([...ADMIN_WEBHOOK_QUERY_KEY, 'list', null], { jobs, nextCursor: null })
  queryClient.setQueryData(charactersQueryKey, characters)
  if (choiceThreshold !== undefined) queryClient.setQueryData(ADMIN_BOT_QUERY_KEY, botStatus(choiceThreshold))
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

const renderDetail = async (job: WebhookJob, choiceThreshold?: number) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData([...ADMIN_WEBHOOK_QUERY_KEY, job.postId], job)
  queryClient.setQueryData(charactersQueryKey, characters)
  if (choiceThreshold !== undefined) queryClient.setQueryData(ADMIN_BOT_QUERY_KEY, botStatus(choiceThreshold))
  const routeTree = createRootRoute({ component: () => createElement(WebhookJobDetail, { postId: job.postId }) })
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

const statusCell = (markup: string) => [...markup.matchAll(/<td\b[^>]*>.*?<\/td>/g)][5]?.[0]
const eventNameCell = (markup: string) => [...markup.matchAll(/<td\b[^>]*>.*?<\/td>/g)][6]?.[0]
const answerThresholds = { eventThreshold: 0.9, fieldThreshold: 0.9, ignoreThreshold: 0.5 }
const shintouAnswers: Record<string, ClefAnswer> = {
  is_event: { type: 'noul', noul: 0.7224 },
  status: { type: 'choice', choice: 'announce', probabilities: { announce: 0.7499, start: 0.15, none: 0.05 } },
  category: { type: 'choice', choice: 'acsta', probabilities: { acsta: 0.4544, ackey: 0.4279, other: 0.09 } },
  start_date: { type: 'choice', choice: 'd20261019', probabilities: { d20261019: 0.9943, none: 0.004 } },
  condition: { type: 'choice', choice: 'purchase', probabilities: { purchase: 0.9813, none: 0.01 } }
}
const answerRows = (markup: string) =>
  [...markup.matchAll(/<tr\b[^>]*>.*?<\/tr>/g)].map((match) => match[0]).filter((row) => row.includes('<td'))
const draft = { title: '新東たん アクリルスタンド配布', stores: ['shintou'], conditions: [] }

describe('Webhook管理画面の判定・通知表示', () => {
  test('受信履歴は8列でキーワード判定とモデル、精度、投稿状態を別々に表示し、末尾に詳細列を置く', async () => {
    const markup = await renderList([listJob])
    expect([...markup.matchAll(/<th\b[^>]*>(.*?)<\/th>/g)].map((match) => match[1])).toEqual([
      'アカウント',
      '日時',
      '判定',
      'モデル',
      '精度',
      'ステータス',
      'イベント名',
      '詳細'
    ])
    expect([...markup.matchAll(/<td\b/g)]).toHaveLength(8)
    expect(markup).toContain('@synthetic_account')
    expect(markup).toContain('2026/10/02')
    const dateCell = [...markup.matchAll(/<td\b[^>]*>.*?<\/td>/g)].find((match) => match[0].includes('2026/10/02'))
    expect(dateCell?.[0]).toContain('tabular-nums')
    expect(dateCell?.[0]).not.toContain('text-xs')
    expect(markup).not.toContain('2026/10/05')
    expect(markup).toContain('継続 99%')
    expect(markup).toContain('72.0%')
    expect(markup).toContain('clef-flash')
    expect([...markup.matchAll(/\d+\.\d%/g)]).toHaveLength(1)
    expect(markup).toContain(`href="/events/${listJob.eventId}"`)
    expect(markup).toContain('紐付け先の実イベント名')
    expect(markup).not.toContain(`/events/${listJob.eventUUID}`)
    // 「詳細」は詳細列のリンクとして出すため、非表示の対象から外した。
    for (const hidden of ['一覧に表示しない投稿本文', '処理回数', 'Discord通知', '保留', '送信結果不明']) {
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
    ['announce', 0.7499, '告知 75%'],
    ['start', 1, '開始 100%'],
    ['ongoing', 0.99, '継続 99%'],
    ['end', 0, '終了 0%'],
    [null, null, '—']
  ] as const)('投稿状態%sを処理状態から推測せず確率付きで表示する', async (postStatus, probability, label) => {
    const markup = await renderList([
      { ...listJob, postStatus, postStatusProbability: probability, model: 'clef', confidence: 0 }
    ])
    expect(markup).toContain(`>${label}</td>`)
    expect(markup).toContain('0.0%')
    expect(markup).toContain('clef')
    expect(markup).not.toContain('clef-flash')
  })

  test.each(['announce', 'start', 'ongoing', 'end', null] as const)(
    '対象外判定はAIの投稿状態%sより却下を優先する',
    async (postStatus) => {
      const markup = await renderList([
        {
          ...listJob,
          status: 'ignored',
          postStatus,
          postStatusProbability: postStatus === null ? null : 0.1,
          confidence: 0.038,
          eventId: null,
          eventTitle: null
        }
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
      {
        ...listJob,
        postStatus: null,
        postStatusProbability: null,
        confidence: null,
        model: null,
        eventId: null,
        eventTitle: null
      }
    ])
    const cells = [...markup.matchAll(/<td\b[^>]*>(.*?)<\/td>/g)].map((match) => match[1])
    // 末尾の詳細列は常にリンクを出すので、モデル・精度・ステータス・イベント名の4列だけを見る。
    expect(cells.slice(3, 7)).toEqual(['—', '—', '—', '—'])
    expect(markup).not.toContain('未判定')
    const precisionCell = [...markup.matchAll(/<td\b[^>]*>.*?<\/td>/g)][4]?.[0]
    expect(precisionCell).not.toContain('font-mono')
    expect(precisionCell).not.toContain('tabular-nums')
    expect(markup).not.toMatch(/\d+\.\d%/)
    expect(markup).not.toContain('href="/events/')
    expect(markup).not.toContain(listJob.eventUUID)
  })

  test('確率がしきい値未満の投稿状態は薄く表示し、理由をtitleに出す', async () => {
    const tentative = { ...listJob, postStatus: 'announce', postStatusProbability: 0.7499 } as const
    const markup = await renderList([tentative], 0.9)
    expect(statusCell(markup)).toContain('>告知 75%</td>')
    expect(statusCell(markup)).toContain('text-muted-foreground')
    expect(statusCell(markup)).toContain('title="確信度がしきい値(90%)未満のため未確定"')
  })

  test('しきい値は設定値から取り、ちょうど届く確率は確定として通常表示する', async () => {
    const markup = await renderList([{ ...listJob, postStatus: 'announce', postStatusProbability: 0.8 }], 0.8)
    expect(statusCell(markup)).toContain('>告知 80%</td>')
    expect(statusCell(markup)).not.toContain('text-muted-foreground')
    expect(statusCell(markup)).not.toContain('title=')
    const lower = await renderList([{ ...listJob, postStatus: 'announce', postStatusProbability: 0.79 }], 0.8)
    expect(statusCell(lower)).toContain('title="確信度がしきい値(80%)未満のため未確定"')
  })

  test('しきい値を取得できない間と、対象外・未判定の行は通常の見た目にする', async () => {
    const low = { ...listJob, postStatus: 'announce', postStatusProbability: 0.3 } as const
    const loading = await renderList([low])
    expect(statusCell(loading)).toContain('>告知 30%</td>')
    expect(statusCell(loading)).not.toContain('text-muted-foreground')
    expect(statusCell(loading)).not.toContain('title=')
    const ignored = await renderList([{ ...low, status: 'ignored' }], 0.9)
    expect(statusCell(ignored)).toContain('>却下</td>')
    expect(statusCell(ignored)).not.toContain('text-muted-foreground')
    const unknown = await renderList([{ ...low, postStatus: null, postStatusProbability: null }], 0.9)
    expect(statusCell(unknown)).toContain('>—</td>')
    expect(statusCell(unknown)).not.toContain('text-muted-foreground')
  })

  test('未確定の判定はしきい値の前後で切り替わる', () => {
    const job = { postStatus: 'announce', postStatusProbability: 0.7499 } as const
    expect(webhookPostStatusIsTentative(job, 0.9)).toBe(true)
    expect(webhookPostStatusIsTentative({ ...job, postStatusProbability: 0.8999 }, 0.9)).toBe(true)
    expect(webhookPostStatusIsTentative({ ...job, postStatusProbability: 0.9 }, 0.9)).toBe(false)
    expect(webhookPostStatusIsTentative({ ...job, postStatusProbability: 0.95 }, 0.9)).toBe(false)
    expect(webhookPostStatusIsTentative({ postStatus: null, postStatusProbability: null }, 0.9)).toBe(false)
    expect(webhookPostStatusIsTentative({ postStatus: 'announce', postStatusProbability: null }, 0.9)).toBe(false)
  })

  test('投稿状態ラベルは確率が無ければラベルだけ、対象外は却下を優先する', () => {
    expect(webhookPostStatusLabel({ status: 'held', postStatus: 'announce', postStatusProbability: 0.7499 })).toBe(
      '告知 75%'
    )
    expect(webhookPostStatusLabel({ status: 'held', postStatus: 'start', postStatusProbability: null })).toBe('開始')
    expect(webhookPostStatusLabel({ status: 'held', postStatus: null, postStatusProbability: null })).toBe('—')
    expect(webhookPostStatusLabel({ status: 'ignored', postStatus: 'end', postStatusProbability: 1 })).toBe('却下')
  })

  test('未登録でAIの下書きタイトルがある行は候補として薄く表示する', async () => {
    const markup = await renderList([{ ...listJob, eventId: null, eventTitle: null, draft }])
    const cell = eventNameCell(markup)
    expect(cell).toContain('新東たん アクリルスタンド配布')
    expect(cell).toContain('text-muted-foreground')
    expect(cell).toContain('>候補</span>')
    expect(cell).toContain('title="AIの下書き。未登録"')
    expect(cell).not.toContain('<a')
    expect(markup).not.toContain('href="/events/')
  })

  test('全セルの中身は行内の基線に乗せず、上下中央に揃える', async () => {
    const markup = await renderList(
      [
        { ...listJob, eventId: null, eventTitle: null, draft },
        { ...listJob, postId: '1000000000000000002', postStatus: 'announce', postStatusProbability: 0.7499 }
      ],
      0.9
    )
    const rows = [...markup.matchAll(/<tr\b[^>]*>.*?<\/tr>/g)]
      .map((match) => match[0])
      .filter((row) => row.includes('<td'))
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      const cells = [...row.matchAll(/<td\b[^>]*>.*?<\/td>/g)].map((match) => match[0])
      expect(cells).toHaveLength(8)
      // ui/table の TableCell が align-middle を持ち、セル直下の要素に inline-flex を使わない。
      // （Badge は inline-flex を持つが、flex コンテナ内では flex アイテムになり基線に乗らない。）
      for (const cell of cells) {
        expect(cell).toContain('align-middle')
        expect(cell).not.toMatch(/^<td\b[^>]*>\s*<[a-z]+\b[^>]*class="[^"]*inline-flex/)
      }
      // アカウント列のリンクはブロックのflexにして、アイコンと文字を同じ高さに揃える。
      const link = cells[0]?.match(/<a\b[^>]*class="([^"]*)"/)?.[1]
      expect(link?.split(' ')).toEqual(expect.arrayContaining(['flex', 'items-center']))
    }
    // 下書きタイトルと「候補」バッジは同じ行に並べ、折り返さない。
    const draftRow = rows[0]?.match(/<div\b[^>]*class="([^"]*)"[^>]*>新東たん/)?.[1]
    expect(draftRow?.split(' ')).toEqual(expect.arrayContaining(['flex', 'items-center', 'whitespace-nowrap']))
    // 未確定のステータスにtitleとmutedを付けても、セルのalign-middleは保たれる。
    const status = rows[1] === undefined ? undefined : [...rows[1].matchAll(/<td\b[^>]*>.*?<\/td>/g)][5]?.[0]
    expect(status).toContain('align-middle')
    expect(status).toContain('text-muted-foreground')
    expect(status).toContain('title=')
  })

  test('登録済みリンクは下書きより優先し、タイトルの無い下書きは—を表示する', async () => {
    const linked = await renderList([{ ...listJob, draft }])
    expect(eventNameCell(linked)).toContain(`href="/events/${listJob.eventId}"`)
    expect(eventNameCell(linked)).not.toContain('候補')
    expect(linked).not.toContain('新東たん アクリルスタンド配布')
    const untitled = await renderList([
      { ...listJob, eventId: null, eventTitle: null, draft: { stores: [], conditions: [] } }
    ])
    expect(eventNameCell(untitled)).toContain('>—</td>')
    expect(untitled).not.toContain('候補')
  })

  test('保留解決フォームの初期値は登録候補を優先し、無ければ基本値へ下書きを重ねる', () => {
    const none = webhookResolveDefaultValues(listJob)
    expect(none).toMatchObject({
      uuid: listJob.eventUUID,
      isVerified: true,
      isPreliminary: false,
      shouldTweet: false,
      referenceUrls: [{ type: 'announce', url: listJob.sourceUrl }]
    })
    expect(none.title).toBeUndefined()
    const filled = webhookResolveDefaultValues({
      ...listJob,
      draft: {
        title: '新東たん アクリルスタンド配布',
        category: 'acsta',
        stores: ['shintou', 'not-a-store'],
        startDate: '2026-10-19',
        endDate: '2026-10-25',
        conditions: [{ type: 'purchase', purchaseAmount: 1000 }],
        limitedQuantity: 100
      }
    })
    expect(filled).toMatchObject({
      uuid: listJob.eventUUID,
      title: '新東たん アクリルスタンド配布',
      category: 'acsta',
      stores: ['shintou'],
      startDate: '2026-10-19T00:00:00+09:00',
      endDate: '2026-10-25T23:59:59+09:00',
      conditions: [{ type: 'purchase', purchaseAmount: 1000 }],
      limitedQuantity: 100,
      referenceUrls: [{ type: 'announce', url: listJob.sourceUrl }]
    })
    expect(filled.conditions?.[0]?.uuid).toMatch(/^[0-9a-f-]{36}$/)
    const candidate: EventRequest = {
      uuid: listJob.eventUUID,
      category: 'other',
      title: '登録候補',
      stores: ['akiba'],
      startDate: '2026-10-11T00:00:00+09:00',
      isVerified: true,
      isPreliminary: false,
      shouldTweet: true,
      conditions: [{ uuid: '11111111-1111-4111-a111-111111111111', type: 'everyone' }],
      referenceUrls: [{ uuid: '22222222-2222-4222-a222-222222222222', type: 'announce', url: listJob.sourceUrl }]
    }
    expect(webhookResolveDefaultValues({ ...listJob, candidate, draft })).toMatchObject({
      title: '登録候補',
      shouldTweet: false
    })
  })

  test('Clef の回答表は質問ごとに1行、確定と未確定をバッジで区別する', () => {
    const markup = renderToStaticMarkup(
      createElement(WebhookAnswerTable, { answers: shintouAnswers, thresholds: answerThresholds })
    )
    expect([...markup.matchAll(/<th\b[^>]*>(.*?)<\/th>/g)].map((match) => match[1])).toEqual([
      '質問',
      '回答',
      '確率',
      'しきい値',
      '判定',
      '次点'
    ])
    const rows = answerRows(markup)
    expect(rows).toHaveLength(5)
    expect(rows.map((row) => row.match(/<td\b[^>]*>(.*?)<\/td>/)?.[1])).toEqual([
      'ビッカメ娘のイベントか',
      '状態',
      '配布物',
      '開始日',
      '配布条件'
    ])
    const badges = [...markup.matchAll(/data-slot="badge"[^>]*>(.*?)<\/span>/g)].map((match) => match[1])
    expect(badges).toEqual(['未確定', '未確定', '未確定', '確定', '確定'])
    expect(markup).toContain('告知')
    expect(markup).toContain('2026-10-19')
    expect(markup).toContain('72.2%')
    expect(markup).toContain('90.0%')
    expect(markup).toContain('開始</span> 15.0%')
    expect(markup).toContain('しきい値は現在の設定です。判定した時点の設定と異なる場合があります。')
  })

  test('確定はtheme トークンの success、未確定は warning で表し、未確定の行だけ薄く強調する', () => {
    const markup = renderToStaticMarkup(
      createElement(WebhookAnswerTable, { answers: shintouAnswers, thresholds: answerThresholds })
    )
    const rows = answerRows(markup)
    expect(rows.filter((row) => row.includes('bg-warning/10'))).toHaveLength(3)
    expect(rows.filter((row) => row.includes('border-success/50'))).toHaveLength(2)
    expect(rows.filter((row) => row.includes('border-warning/60'))).toHaveLength(3)
    expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(/)
  })

  test('回答表の確率は右寄せのmono、しきい値が無い間は しきい値と判定の列に—を出す', () => {
    const loading = renderToStaticMarkup(createElement(WebhookAnswerTable, { answers: shintouAnswers }))
    const rows = answerRows(loading)
    expect(rows).toHaveLength(5)
    for (const row of rows) {
      const cells = [...row.matchAll(/<td\b[^>]*>(.*?)<\/td>/g)].map((match) => match[1])
      expect(cells[3]).toBe('—')
      expect(cells[4]).toBe('—')
      const probability = row.match(/<td\b[^>]*class="([^"]*)"[^>]*>[\d.]+%<\/td>/)?.[1]
      expect(probability?.split(' ')).toEqual(expect.arrayContaining(['text-right', 'font-mono', 'tabular-nums']))
    }
    expect(loading).not.toContain('data-slot="badge"')
    expect(loading).not.toContain('bg-warning/10')
  })

  test('回答表の全セルは上下中央に揃え、中身にinline-flexを使わずブロックのflexを使う', () => {
    const markup = renderToStaticMarkup(
      createElement(WebhookAnswerTable, { answers: shintouAnswers, thresholds: answerThresholds })
    )
    for (const row of answerRows(markup)) {
      const cells = [...row.matchAll(/<td\b[^>]*>.*?<\/td>/g)].map((match) => match[0])
      expect(cells).toHaveLength(6)
      for (const cell of cells) {
        expect(cell).toContain('align-middle')
        expect(cell).not.toMatch(/^<td\b[^>]*>\s*<[a-z]+\b[^>]*class="[^"]*inline-flex/)
      }
    }
    const judge = [...markup.matchAll(/<td\b[^>]*>(?:(?!<\/td>).)*data-slot="badge".*?<\/td>/g)]
    expect(judge).toHaveLength(5)
    for (const cell of judge) expect(cell[0]).toMatch(/<div class="flex items-center">/)
    expect(markup).toMatch(/<div class="flex items-center gap-4">/)
  })

  test('回答が空の時は表の代わりに「回答の記録なし」を出す', () => {
    const markup = renderToStaticMarkup(
      createElement(WebhookAnswerTable, { answers: {}, thresholds: answerThresholds })
    )
    expect(markup).toContain('回答の記録なし')
    expect(markup).not.toContain('<table')
  })

  test('詳細は「元投稿」と「判定・イベント登録」の間に「Clef の回答」を出し、判定理由は日本語でコードをtitleに残す', async () => {
    const markup = await renderDetail(
      {
        ...listJob,
        answers: shintouAnswers,
        reasons: ['store_unconfirmed', 'possible_duplicate:550e8400-e29b-41d4-a716-446655440000', 'future_reason']
      },
      0.9
    )
    const headings = [...markup.matchAll(/<h2\b[^>]*>(.*?)<\/h2>/g)].map((match) => match[1])
    expect(headings.slice(0, 3)).toEqual(['元投稿', 'Clef の回答', '判定・イベント登録'])
    expect(markup).toContain('>店舗を確定できない</li>')
    expect(markup).toContain('title="store_unconfirmed"')
    expect(markup).toContain('>重複の可能性あり</li>')
    expect(markup).toContain('title="possible_duplicate:550e8400-e29b-41d4-a716-446655440000"')
    expect(markup).toContain('>future_reason</li>')
    expect(markup).toContain('2026-10-19')
    // bot 設定の choiceThreshold を現在のしきい値として表に渡す。
    expect(markup).toContain('data-slot="badge"')
  })

  test('詳細で回答が無いジョブは「回答の記録なし」を出し、しきい値が無い間は判定バッジを出さない', async () => {
    const none = await renderDetail({ ...listJob, answers: null })
    expect(none).toContain('Clef の回答')
    expect(none).toContain('回答の記録なし')
    expect(none).not.toContain('<table aria-label')
    const loading = await renderDetail({ ...listJob, answers: shintouAnswers })
    expect(loading).toContain('<table')
    expect(loading).toContain('2026-10-19')
    expect(loading).not.toContain('border-success/50')
    expect(loading).not.toContain('border-warning/60')
  })

  test('空状態は列数と同じ8列をまたぐ', async () => {
    const markup = await renderList([])
    const headerCount = [...markup.matchAll(/<th\b/g)].length
    expect(headerCount).toBe(8)
    expect(markup).toContain(`colSpan="${headerCount}"`)
    expect(markup).toContain('受信履歴はありません。')
  })

  test('一覧の全行に詳細画面へのリンクを同じ位置に出す', async () => {
    const second = { ...listJob, postId: '1000000000000000002', status: 'registered' } as const
    const ignored = {
      ...listJob,
      postId: '1000000000000000003',
      status: 'ignored',
      eventId: null,
      eventTitle: null
    } as const
    const jobs: WebhookJob[] = [listJob, second, ignored]
    const markup = await renderList(jobs, 0.9)
    const rows = [...markup.matchAll(/<tr\b[^>]*>.*?<\/tr>/g)]
      .map((match) => match[0])
      .filter((row) => row.includes('<td'))
    expect(rows).toHaveLength(jobs.length)
    for (const [index, row] of rows.entries()) {
      const cells = [...row.matchAll(/<td\b[^>]*>.*?<\/td>/g)].map((match) => match[0])
      expect(cells).toHaveLength(8)
      // 状態にかかわらず、最後のセルに /admin/webhooks/<postId> へのリンクがある。
      const detailCell = cells.at(-1)
      expect(detailCell).toContain(`href="/admin/webhooks/${jobs[index]?.postId}"`)
      expect(detailCell).toContain('詳細')
      // 行を識別できるアクセシブルな名前を持つ。
      expect(detailCell).toContain('aria-label="@synthetic_accountの判定詳細"')
    }
    // 外部リンクのアカウント列は、詳細画面ではなく X の投稿を指したまま。
    expect(rows[0]?.match(/<td\b[^>]*>.*?<\/td>/)?.[0]).toContain(`href="${listJob.sourceUrl}"`)
    expect(rows[0]?.match(/<td\b[^>]*>.*?<\/td>/)?.[0]).not.toContain('/admin/webhooks/')
  })

  test('登録済みアカウントの詳細リンクはキャラクター名で行を識別する', async () => {
    const markup = await renderList([{ ...listJob, post: { ...listJob.post, screenName: 'BIC_ABENO' } }])
    expect(markup).toContain('aria-label="あべのたんの判定詳細"')
  })

  test('詳細リンクのセルはブロックのflexで上下中央に揃え、inline-flexを使わない', async () => {
    const markup = await renderList([listJob, { ...listJob, postId: '1000000000000000002' }])
    const rows = [...markup.matchAll(/<tr\b[^>]*>.*?<\/tr>/g)]
      .map((match) => match[0])
      .filter((row) => row.includes('<td'))
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      const detailCell = [...row.matchAll(/<td\b[^>]*>.*?<\/td>/g)].map((match) => match[0]).at(-1)
      expect(detailCell).toContain('align-middle')
      const link = detailCell?.match(/<a\b[^>]*class="([^"]*)"/)?.[1]
      expect(link?.split(' ')).toEqual(expect.arrayContaining(['flex', 'items-center']))
      expect(link?.split(' ')).not.toContain('inline-flex')
      // Button の ghost / sm の見た目と ChevronRight のアイコンを持つ。
      expect(detailCell).toContain('data-slot="button"')
      expect(detailCell).toContain('data-variant="ghost"')
      expect(detailCell).toContain('lucide-chevron-right')
    }
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
      canRejudge: false,
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
