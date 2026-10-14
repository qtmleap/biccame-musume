import { describe, expect, test } from 'bun:test'
import type { ClefAnswer } from '@biccame/shared/event-detect/clef'
import type { FieldThresholds } from '@biccame/shared/event-detect/detection'
import type { AdminBotStatus } from '@biccame/shared/schemas/admin-bot.dto'
import type { EventRequest } from '@biccame/shared/schemas/event.dto'
import { StoreDataSchema } from '@biccame/shared/schemas/store.dto'
import {
  type WebhookJob,
  WebhookNotificationStatusSchema,
  WebhookPostStatusFilterSchema
} from '@biccame/shared/schemas/webhook.dto'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { createStore, Provider } from 'jotai'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  INITIAL_WEBHOOK_FILTER,
  NO_WEBHOOK_FILTER,
  type WebhookFilter,
  webhookFilterAtom
} from '@/atoms/webhook-filter-atom'
import { INITIAL_WEBHOOK_PAGINATION, webhookPaginationAtom } from '@/atoms/webhook-pagination-atom'
import { WebhookAnswerTable } from '@/components/admin/webhook-answer-table'
import { webhookEventCreateSearch } from '@/components/admin/webhook-form-defaults'
import { WebhookJobDetail } from '@/components/admin/webhook-job-detail'
import { WebhookJobList } from '@/components/admin/webhook-job-list'
import {
  detectionScoreLabel,
  notificationRetryWarning,
  webhookAccountLabel,
  webhookActionAvailability,
  webhookCandidateTitle,
  webhookJobLabel,
  webhookKeywordLabel,
  webhookNotificationLabel,
  webhookPostStatusFilterLabel,
  webhookPostStatusIsTentative,
  webhookPostStatusLabel
} from '@/components/admin/webhook-labels'
import { WebhookStatusBadge } from '@/components/admin/webhook-status-badge'
import { ADMIN_BOT_QUERY_KEY } from '@/hooks/use-admin-bot'
import { ADMIN_WEBHOOK_QUERY_KEY, webhookJobListQueryKey } from '@/hooks/use-admin-webhooks'
import { charactersQueryKey } from '@/hooks/use-characters'
import { adminEndpoints } from '@/utils/client/admin'
import canonicalCharacters from '../workers/web/public/characters.json'

const characters = (() => {
  const parsed = StoreDataSchema.array().safeParse(canonicalCharacters)
  if (!parsed.success) throw new Error('Invalid canonical character fixture')
  return parsed.data
})()

const listJob: WebhookJob = {
  candidates: [],
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

const uniformThresholds = (value: number): FieldThresholds => ({
  status: value,
  category: value,
  store: value,
  start_date: value,
  end_date: value,
  quantity: value,
  condition: value,
  purchase_amount: value
})
// 共通値と8項目すべてを同じしきい値にした設定。項目別の差は fieldThresholds で上書きして付ける。
const botStatus = (choiceThreshold: number, fieldThresholds: Partial<FieldThresholds> = {}): AdminBotStatus => ({
  fetchedAt: '2026-10-05T03:00:00.000Z',
  botConnected: true,
  discord: null,
  webhook: {
    configured: true,
    queueConfigured: true,
    model: 'clef',
    eventThreshold: 0.9,
    ignoreThreshold: 0.5,
    choiceThreshold,
    fieldThresholds: { ...uniformThresholds(choiceThreshold), ...fieldThresholds }
  },
  error: null
})

type RenderListOptions = { filter?: WebhookFilter; nextCursor?: string | null }

/** 一覧を描画する。jotai の既定ストアは使わず、テストごとの store に絞り込みの保存値を入れる（他のテストへ漏らさない）。 */
const renderList = async (
  jobs: WebhookJob[],
  choiceThreshold?: number,
  fieldThresholds?: Partial<FieldThresholds>,
  { filter = INITIAL_WEBHOOK_FILTER, nextCursor = null }: RenderListOptions = {}
) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(webhookJobListQueryKey(null, filter), { jobs, nextCursor })
  queryClient.setQueryData(charactersQueryKey, characters)
  if (choiceThreshold !== undefined)
    queryClient.setQueryData(ADMIN_BOT_QUERY_KEY, botStatus(choiceThreshold, fieldThresholds))
  const store = createStore()
  store.set(webhookFilterAtom, filter)
  store.set(webhookPaginationAtom, INITIAL_WEBHOOK_PAGINATION)
  const routeTree = createRootRoute({ component: WebhookJobList })
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  try {
    await router.load()
    return renderToStaticMarkup(
      createElement(
        Provider,
        { store },
        createElement(QueryClientProvider, { client: queryClient }, createElement(RouterProvider, { router }))
      )
    )
  } finally {
    queryClient.clear()
  }
}

const renderDetail = async (job: WebhookJob, choiceThreshold?: number, fieldThresholds?: Partial<FieldThresholds>) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData([...ADMIN_WEBHOOK_QUERY_KEY, job.postId], job)
  queryClient.setQueryData(charactersQueryKey, characters)
  if (choiceThreshold !== undefined)
    queryClient.setQueryData(ADMIN_BOT_QUERY_KEY, botStatus(choiceThreshold, fieldThresholds))
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
    // 精度の見出しは並べ替えのボタン（アイコン付き）なので、タグを除いた文字で比べる。
    expect([...markup.matchAll(/<th\b[^>]*>(.*?)<\/th>/g)].map((match) => match[1]?.replace(/<[^>]*>/g, ''))).toEqual([
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
    expect(statusCell(markup)).toContain('>継続</td>')
    expect(markup).not.toContain('99%')
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
    ['announce', 0.7499, '告知'],
    ['start', 1, '開始'],
    ['ongoing', 0.99, '継続'],
    ['end', 0, '終了'],
    [null, null, '—']
  ] as const)(
    '投稿状態%sを処理状態から推測せず確率を付けずラベルだけで表示する',
    async (postStatus, probability, label) => {
      const markup = await renderList([
        { ...listJob, postStatus, postStatusProbability: probability, model: 'clef', confidence: 0 }
      ])
      expect(statusCell(markup)).toContain(`>${label}</td>`)
      expect(statusCell(markup)).not.toMatch(/\d%/)
      expect(markup).toContain('0.0%')
      expect(markup).toContain('clef')
      expect(markup).not.toContain('clef-flash')
    }
  )

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

  // td に font-mono を付けると行の基線が等幅フォントで決まり、日本語フォントの隣のセルより数字が上にずれる。
  // span の行高を 0 にして、等幅フォントの余白が行ボックスを広げ、基線を1px動かすのも防ぐ。
  test('受信履歴の精度は、td ではなく内側の span が font-mono と tabular-nums を持つ', async () => {
    const markup = await renderList([listJob])
    const precisionCell = [...markup.matchAll(/<td\b([^>]*)>(.*?)<\/td>/g)][4]
    expect(precisionCell?.[1]).toContain('text-right')
    expect(precisionCell?.[1]).not.toContain('font-mono')
    expect(precisionCell?.[1]).not.toContain('tabular-nums')
    expect(precisionCell?.[2]).toBe('<span class="font-mono tabular-nums leading-[0]">72.0%</span>')
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

  test('確率が0.75でも一覧は「告知」だけを出し、しきい値未満なら薄い文字色と理由のtitleが付く', async () => {
    const tentative = { ...listJob, postStatus: 'announce', postStatusProbability: 0.7499 } as const
    const markup = await renderList([tentative], 0.9)
    expect(statusCell(markup)).toContain('>告知</td>')
    expect(statusCell(markup)).not.toMatch(/\d%</)
    expect(statusCell(markup)).toContain('text-muted-foreground')
    expect(statusCell(markup)).toContain('title="確信度がしきい値(90%)未満のため未確定"')
  })

  test('しきい値は設定値から取り、ちょうど届く確率は確定として通常表示する', async () => {
    const markup = await renderList([{ ...listJob, postStatus: 'announce', postStatusProbability: 0.8 }], 0.8)
    expect(statusCell(markup)).toContain('>告知</td>')
    expect(statusCell(markup)).not.toContain('text-muted-foreground')
    expect(statusCell(markup)).not.toContain('title=')
    const lower = await renderList([{ ...listJob, postStatus: 'announce', postStatusProbability: 0.79 }], 0.8)
    expect(statusCell(lower)).toContain('title="確信度がしきい値(80%)未満のため未確定"')
  })

  test('しきい値を取得できない間と、対象外・未判定の行は通常の見た目にする', async () => {
    const low = { ...listJob, postStatus: 'announce', postStatusProbability: 0.3 } as const
    const loading = await renderList([low])
    expect(statusCell(loading)).toContain('>告知</td>')
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

  test('投稿状態ラベルは確率があってもラベルだけ、対象外は却下を優先する', () => {
    expect(webhookPostStatusLabel({ status: 'held', postStatus: 'announce', postStatusProbability: 0.7499 })).toBe(
      '告知'
    )
    expect(webhookPostStatusLabel({ status: 'held', postStatus: 'end', postStatusProbability: 0 })).toBe('終了')
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

  test('イベント作成ページへ渡すクエリは登録候補を優先し、無ければ下書きから作り、元投稿URLは常に渡す', () => {
    const none = webhookEventCreateSearch(listJob)
    expect(none).toEqual({ referenceUrls: listJob.sourceUrl })
    for (const key of ['title', 'category', 'stores', 'startDate', 'endDate']) expect(none).not.toHaveProperty(key)
    const filled = webhookEventCreateSearch({
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
    expect(filled).toEqual({
      title: '新東たん アクリルスタンド配布',
      category: 'acsta',
      stores: 'shintou',
      startDate: '2026-10-19',
      endDate: '2026-10-25',
      referenceUrls: listJob.sourceUrl
    })
    // 作成ページのクエリで渡せない配布条件と数量は含めない。
    expect(filled).not.toHaveProperty('conditions')
    expect(filled).not.toHaveProperty('limitedQuantity')
    // 下書きの空の項目はキーごと省略し、有効な店舗が無ければ stores も省略する。
    const sparse = webhookEventCreateSearch({ ...listJob, draft: { stores: ['not-a-store'], conditions: [] } })
    expect(sparse).toEqual({ referenceUrls: listJob.sourceUrl })
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
    const fromCandidate = webhookEventCreateSearch({ ...listJob, candidate, draft })
    expect(fromCandidate).toEqual({
      title: '登録候補',
      category: 'other',
      stores: 'akiba',
      startDate: '2026-10-11',
      referenceUrls: listJob.sourceUrl
    })
    expect(fromCandidate).not.toHaveProperty('endDate')
    // 終了日は JST の日付にそろえる。複数店舗はカンマ区切り。
    expect(
      webhookEventCreateSearch({
        ...listJob,
        candidate: { ...candidate, stores: ['akiba', 'shintou'], endDate: '2026-10-25T23:59:59+09:00' }
      })
    ).toMatchObject({ stores: 'akiba,shintou', startDate: '2026-10-11', endDate: '2026-10-25' })
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
      // しきい値の列は mono の span の中に—を置く（td は右寄せのまま、基線は sans で決まる）。
      expect(cells[3]).toBe('<span class="font-mono tabular-nums leading-[0]">—</span>')
      expect(cells[4]).toBe('—')
      const probability = row.match(/<td\b[^>]*class="([^"]*)"[^>]*><span\b[^>]*>[\d.]+%<\/span><\/td>/)?.[1]
      expect(probability?.split(' ')).toEqual(expect.arrayContaining(['text-right']))
    }
    expect(loading).not.toContain('data-slot="badge"')
    expect(loading).not.toContain('bg-warning/10')
  })

  // td に font-mono を付けると行の基線が等幅フォントで決まり、日本語フォントの隣のセルより数字が上にずれる。
  // span の行高を 0 にして、等幅フォントの余白が行ボックスを広げ、基線を1px動かすのも防ぐ。
  test('回答表の確率としきい値は、td ではなく内側の span が font-mono と tabular-nums を持つ', () => {
    for (const thresholds of [answerThresholds, undefined]) {
      const markup = renderToStaticMarkup(createElement(WebhookAnswerTable, { answers: shintouAnswers, thresholds }))
      for (const row of answerRows(markup)) {
        const cells = [...row.matchAll(/<td\b([^>]*)>(.*?)<\/td>/g)]
        for (const index of [2, 3]) {
          const attributes = cells[index]?.[1]
          const content = cells[index]?.[2]
          expect(attributes).toContain('text-right')
          expect(attributes).not.toContain('font-mono')
          expect(attributes).not.toContain('tabular-nums')
          expect(content).toMatch(/^<span class="font-mono tabular-nums leading-\[0\]">[^<]+<\/span>$/)
        }
      }
    }
  })

  // 外側の等幅 span は行高 0、内側の sans の span だけ行高 20px にして、行ボックスと基線を sans で決める。
  // そうしないと等幅フォントの余白で行ボックスが 22px に広がり、次点が隣のセルより 1px 上にずれる。
  test('回答表の次点は、外側の等幅spanの行高を0、内側のsansのspanの行高を20pxにして基線を揃える', () => {
    const markup = renderToStaticMarkup(
      createElement(WebhookAnswerTable, { answers: shintouAnswers, thresholds: answerThresholds })
    )
    const alternativeCells = answerRows(markup).flatMap((row) => {
      const cell = [...row.matchAll(/<td\b[^>]*>(.*?)<\/td>/g)][5]?.[1]
      return cell === undefined || cell === '—' ? [] : [cell]
    })
    expect(alternativeCells).toHaveLength(5)
    const alternative =
      '<span class="font-mono tabular-nums leading-\\[0\\]"><span class="font-sans leading-5">[^<]+</span> [\\d.]+%</span>'
    for (const cell of alternativeCells) {
      expect(cell).toMatch(new RegExp(`^<div class="flex items-center gap-4">(${alternative})+</div>$`))
    }
    // 次点が2件ある行（status・category）は、gap-4 の flex の中に2つ並ぶ。
    expect(alternativeCells.filter((cell) => cell.split('font-sans').length === 3)).toHaveLength(2)
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

  test('詳細は先頭に投稿全体の配布物数チェックを置き、「元投稿」と「判定・イベント登録」の間に「Clef の回答」を出し、判定理由は日本語でコードをtitleに残す', async () => {
    const markup = await renderDetail(
      {
        ...listJob,
        answers: shintouAnswers,
        reasons: ['store_unconfirmed', 'possible_duplicate:550e8400-e29b-41d4-a716-446655440000', 'future_reason']
      },
      0.9
    )
    const headings = [...markup.matchAll(/<h2\b[^>]*>(.*?)<\/h2>/g)].map((match) => match[1])
    expect(headings.slice(0, 4)).toEqual(['投稿全体の配布物数チェック', '元投稿', 'Clef の回答', '判定・イベント登録'])
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

  test('詳細列の見出しは sr-only の「詳細」で視覚的に隠し、各行には「詳細」リンクが残る', async () => {
    const jobs = [listJob, { ...listJob, postId: '1000000000000000002' }]
    const markup = await renderList(jobs)
    const headings = [...markup.matchAll(/<th\b([^>]*)>(.*?)<\/th>/g)]
    expect(headings).toHaveLength(8)
    // 見出しの文字は sr-only の span に入り、th 自身は表示用の文字を持たない（列の幅用の whitespace-nowrap は維持）。
    expect(headings.at(-1)?.[2]).toBe('<span class="sr-only">詳細</span>')
    expect(headings.at(-1)?.[1]).toContain('whitespace-nowrap')
    // sr-only でない「詳細」は、各行のリンクだけ。
    expect(markup.match(/<th\b[^>]*>[^<]*詳細/g)).toBeNull()
    const links = [...markup.matchAll(/<a\b[^>]*href="\/admin\/webhooks\/[^"]*"[^>]*>(.*?)<\/a>/g)]
    expect(links).toHaveLength(jobs.length)
    for (const link of links) expect(link[1]).toMatch(/^詳細<svg/)
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
    expect(webhookActionAvailability('held', 'skipped', []).canRetryNotification).toBe(false)
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
    expect(webhookActionAvailability('registered', 'failed', [])).toEqual({
      canResolve: false,
      canRetryProcessing: false,
      canRejudge: false,
      canRetryNotification: true
    })
  })

  test('保留の解決と失敗した判定の再実行を区別する', () => {
    expect(webhookActionAvailability('held', 'sent', []).canResolve).toBe(true)
    expect(webhookActionAvailability('failed', 'pending', []).canRetryProcessing).toBe(true)
    expect(webhookActionAvailability('processing', 'unknown', []).canRetryNotification).toBe(false)
    expect(webhookActionAvailability('ignored', 'sent', []).canResolve).toBe(false)
    // 対象外は解決の対象ではないが、人が却下していなければ再判定はできる。
    expect(webhookActionAvailability('ignored', 'skipped', ['not_distribution_event']).canRejudge).toBe(true)
    expect(webhookActionAvailability('ignored', 'skipped', ['manually_rejected']).canRejudge).toBe(false)
  })

  test('結果不明の再送は重複の危険を明示する', () => {
    expect(notificationRetryWarning('unknown')).toContain('重複')
    expect(notificationRetryWarning('failed')).toContain('AI判定は繰り返しません')
  })
})

const anchorsOf = (markup: string) => [...markup.matchAll(/<a\b[^>]*>.*?<\/a>/g)].map((match) => match[0])
// ボタンは button か、asChild の Link（a）で出る。どちらも data-slot と data-variant を持つ。
const outlineTags = (markup: string) =>
  [...markup.matchAll(/<(?:button|a)\b[^>]*data-variant="outline"[^>]*>/g)].map((match) => match[0])

describe('受信詳細・受信履歴の戻り先', () => {
  test('受信詳細の左上は受信履歴（/admin/webhooks）に戻り、管理画面に戻るリンクは出さない', async () => {
    const markup = await renderDetail(listJob, 0.9)
    const back = anchorsOf(markup).find((anchor) => anchor.includes('受信履歴に戻る'))
    expect(back).toBeDefined()
    expect(back).toContain('href="/admin/webhooks"')
    expect(markup).not.toContain('管理画面に戻る')
    expect(markup).not.toContain('href="/admin"')
  })

  test('受信詳細の右上に受信履歴ボタンは無く、更新ボタンだけが残る', async () => {
    const markup = await renderDetail(listJob, 0.9)
    // 受信履歴（/admin/webhooks）へのリンクは、左上の戻るリンク1つだけ。
    expect(anchorsOf(markup).filter((anchor) => anchor.includes('href="/admin/webhooks"'))).toHaveLength(1)
    expect(markup).not.toMatch(/<\/svg>受信履歴<\/a>/)
    const header = markup.slice(markup.indexOf('<header'), markup.indexOf('</header>'))
    expect(header).toContain('更新')
    expect(header).not.toContain('受信履歴')
  })

  test('受信履歴（一覧）の戻り先は従来どおり管理画面（/admin）', async () => {
    const markup = await renderList([listJob], 0.9)
    const back = anchorsOf(markup).find((anchor) => anchor.includes('管理画面に戻る'))
    expect(back).toBeDefined()
    expect(back).toContain('href="/admin"')
    expect(markup).not.toContain('受信履歴に戻る')
  })
})

describe('管理画面の outline ボタンの枠線', () => {
  test('受信詳細の outline ボタンはすべて枠線に border-card-border を指定する', async () => {
    const tags = outlineTags(await renderDetail(listJob, 0.9))
    // 更新・既存へ紐付け・対象外にする・失敗した処理を再実行・AI で判定し直す・通知を再送。
    expect(tags).toHaveLength(6)
    for (const tag of tags) expect(tag).toContain('border-card-border')
  })

  test('受信履歴の outline ボタンはすべて枠線に border-card-border を指定する', async () => {
    const tags = outlineTags(await renderList([listJob], 0.9))
    // 更新・bot 設定・条件をクリア・前へ・次へ。
    expect(tags).toHaveLength(5)
    for (const tag of tags) expect(tag).toContain('border-card-border')
  })
})

describe('受信履歴の絞り込みツールバーと並べ替え', () => {
  const toolbar = (markup: string) => markup.match(/<fieldset\b[^>]*aria-label="絞り込み"[^>]*>.*?<\/fieldset>/)?.[0]
  const confidenceHeader = (markup: string) =>
    [...markup.matchAll(/<th\b[^>]*>.*?<\/th>/g)].map((match) => match[0]).find((cell) => cell.includes('>精度'))
  // 条件なし（NO_WEBHOOK_FILTER）を土台に上書きする。既定（判定は一致）が混ざると、判定の違いが検証から消えるため。
  const filterWith = (overrides: Partial<WebhookFilter>): WebhookFilter => ({ ...NO_WEBHOOK_FILTER, ...overrides })
  const selectValues = (bar: string | undefined) =>
    bar === undefined ? [] : [...bar.matchAll(/data-slot="select-value"[^>]*>(.*?)<\/span>/g)].map((match) => match[1])

  test('表の上に、期間・判定・ステータス・条件をクリアをこの順で同じ場所に出し、精度の絞り込みは出さない', async () => {
    const markup = await renderList([listJob], 0.9)
    const bar = toolbar(markup)
    expect(bar).toBeDefined()
    const labels = ['aria-label="期間"', 'aria-label="判定"', 'aria-label="ステータス"', '条件をクリア']
    for (const label of labels) expect(bar).toContain(label)
    const positions = labels.map((label) => (bar === undefined ? -1 : bar.indexOf(label)))
    expect(positions).toEqual(positions.toSorted((a, b) => a - b))
    // 精度の絞り込み（下限・上限の入力欄）は無い。精度は並べ替えだけ。
    expect(bar).not.toContain('aria-label="精度 下限 %"')
    expect(bar).not.toContain('aria-label="精度 上限 %"')
    expect(bar).not.toContain('<input')
    expect(markup).not.toContain('aria-label="精度 下限 %"')
    expect(markup).not.toContain('aria-label="精度 上限 %"')
    // ツールバーは表より前にある。
    expect(markup.indexOf('aria-label="絞り込み"')).toBeLessThan(markup.indexOf('<table'))
    // 既定の選択は、期間は「すべて」、判定は「一致」、ステータスは「すべて」。
    expect(selectValues(bar)).toEqual(['すべて', '一致', 'すべて'])
  })

  test('ステータスの選択肢は 告知・開始・継続・終了・却下 で、列の表示と同じ文言を使う', () => {
    const labels = WebhookPostStatusFilterSchema.options.map(webhookPostStatusFilterLabel)
    expect(labels).toEqual(['告知', '開始', '継続', '終了', '却下'])
    // 一覧の「ステータス」列（webhookPostStatusLabel）と同じ表示。却下はジョブの状態が最優先。
    const base = { status: 'registered', postStatusProbability: 0.9 } as const
    expect(
      (['announce', 'start', 'ongoing', 'end'] as const).map((postStatus) =>
        webhookPostStatusLabel({ ...base, postStatus })
      )
    ).toEqual(labels.slice(0, 4))
    expect(webhookPostStatusLabel({ ...base, status: 'ignored', postStatus: 'announce' })).toBe(labels[4])
  })

  test('条件なし（判定が null）の絞り込みでは、判定を既定の一致に戻さず「すべて」と表示する', async () => {
    const bar = toolbar(await renderList([listJob], 0.9, undefined, { filter: NO_WEBHOOK_FILTER }))
    expect(selectValues(bar)).toEqual(['すべて', 'すべて', 'すべて'])
  })

  test('絞り込みの値は選択中の表示に出す', async () => {
    const filter = filterWith({ range: '24h', verdict: 'excluded', postStatus: 'ongoing' })
    const bar = toolbar(await renderList([listJob], 0.9, undefined, { filter }))
    expect(selectValues(bar)).toEqual(['直近24時間', '除外', '継続'])
    for (const [postStatus, label] of [
      ['announce', '告知'],
      ['start', '開始'],
      ['end', '終了'],
      ['ignored', '却下']
    ] as const) {
      const other = toolbar(await renderList([listJob], 0.9, undefined, { filter: filterWith({ postStatus }) }))
      expect(selectValues(other)).toEqual(['すべて', 'すべて', label])
    }
  })

  test('「条件をクリア」は常に出し、外せる条件が無い（NO_WEBHOOK_FILTER）ときだけ disabled にする', async () => {
    const clearButton = (markup: string) =>
      [...markup.matchAll(/<button\b[^>]*>.*?<\/button>/g)]
        .map((match) => match[0])
        .find((tag) => tag.includes('条件をクリア'))
    // 既定は判定が一致なので、外せる条件がある。押せる。
    const initial = clearButton(await renderList([listJob], 0.9))
    expect(initial).toBeDefined()
    expect(initial).not.toContain('disabled=""')
    expect(initial).toContain('border-card-border')
    // 条件が何も無ければ押せない。
    const none = clearButton(await renderList([listJob], 0.9, undefined, { filter: NO_WEBHOOK_FILTER }))
    expect(none).toContain('disabled=""')
    expect(none).toContain('border-card-border')
    for (const filter of [
      INITIAL_WEBHOOK_FILTER,
      filterWith({ range: '1h' }),
      filterWith({ verdict: 'match' }),
      filterWith({ verdict: 'excluded' }),
      filterWith({ postStatus: 'announce' }),
      filterWith({ postStatus: 'ignored' }),
      filterWith({ sort: 'confidence', order: 'desc' }),
      filterWith({ sort: 'confidence', order: 'asc' })
    ]) {
      const active = clearButton(await renderList([listJob], 0.9, undefined, { filter }))
      expect(active).toBeDefined()
      expect(active).not.toContain('disabled=""')
    }
  })

  test('精度の見出しはボタンで、並べ替えの向きを aria-sort と矢印アイコンで示す', async () => {
    const cases = [
      [INITIAL_WEBHOOK_FILTER, 'none', 'lucide-arrow-up-down'],
      [filterWith({ sort: 'confidence', order: 'desc' }), 'descending', 'lucide-arrow-down'],
      [filterWith({ sort: 'confidence', order: 'asc' }), 'ascending', 'lucide-arrow-up']
    ] as const
    for (const [filter, ariaSort, icon] of cases) {
      const header = confidenceHeader(await renderList([listJob], 0.9, undefined, { filter }))
      expect(header).toContain(`aria-sort="${ariaSort}"`)
      expect(header).toContain('<button')
      expect(header).toContain(icon)
      // 矢印アイコンは装飾。ボタンの名前は「精度」だけ。
      expect(header).toContain('aria-hidden="true"')
      expect(header).toMatch(/>精度<svg/)
    }
  })

  test('精度の見出しボタンは行内で右寄せの数値列に揃い、操作の説明を title に持つ', async () => {
    const header = confidenceHeader(await renderList([listJob], 0.9))
    expect(header).toContain('aria-sort="none"')
    expect(header).toContain('text-right')
    expect(header).toContain('title="精度の高い順に並べ替え"')
    const high = confidenceHeader(
      await renderList([listJob], 0.9, undefined, { filter: filterWith({ sort: 'confidence', order: 'desc' }) })
    )
    expect(high).toContain('title="精度の低い順に並べ替え"')
    const low = confidenceHeader(
      await renderList([listJob], 0.9, undefined, { filter: filterWith({ sort: 'confidence', order: 'asc' }) })
    )
    expect(low).toContain('title="日時の新しい順に戻す"')
  })

  test('0件でも先があるときは続きを検索できる旨を、先が無いときは従来の文言を出す', async () => {
    const more = await renderList([], 0.9, undefined, { nextCursor: '1000000000000000001' })
    expect(more).toContain('この範囲には条件に合う履歴がありません。「次へ」で続きを検索できます。')
    expect(more).not.toContain('受信履歴はありません。')
    const none = await renderList([], 0.9)
    expect(none).toContain('受信履歴はありません。')
    expect(none).not.toContain('続きを検索できます')
    // どちらも8列をまたぐ。
    expect(more).toContain('colSpan="8"')
  })

  test('更新・前へ・次へと同じく、ツールバーのボタンも枠線色は共通テーマ色', async () => {
    const bar = toolbar(await renderList([listJob], 0.9))
    expect(bar).toBeDefined()
    for (const tag of outlineTags(bar === undefined ? '' : bar)) expect(tag).toContain('border-card-border')
  })
})

describe('候補の表示名', () => {
  const baseCandidate = {
    eventTitle: null,
    candidate: null,
    item: 'ハロウィン限定名刺'
  } as const
  const registeredRequest: EventRequest = {
    uuid: listJob.eventUUID,
    category: 'limited_card',
    title: 'AI が付けた題',
    stores: ['akiba'],
    startDate: '2026-10-11T00:00:00+09:00',
    isVerified: true,
    isPreliminary: false,
    shouldTweet: false,
    conditions: [{ uuid: '11111111-1111-4111-a111-111111111111', type: 'everyone' }],
    referenceUrls: [{ uuid: '22222222-2222-4222-a222-222222222222', type: 'announce', url: listJob.sourceUrl }]
  }

  test('登録済みなら登録イベントの題、無ければ保存済みの登録候補の題、無ければ抽出名の順で選ぶ', () => {
    expect(
      webhookCandidateTitle({ ...baseCandidate, eventTitle: '実際のイベント名', candidate: registeredRequest })
    ).toBe('実際のイベント名')
    expect(webhookCandidateTitle({ ...baseCandidate, candidate: registeredRequest })).toBe('AI が付けた題')
    expect(webhookCandidateTitle(baseCandidate)).toBe('ハロウィン限定名刺')
  })

  test('一覧は登録済みのリンクにも未登録の行にも同じ表示名を使う', async () => {
    const candidates = [
      {
        ...listJob,
        item: '抽出名のみ',
        storeKey: 'akiba',
        status: 'held' as const,
        eventId: null,
        eventTitle: null,
        candidate: null
      },
      {
        ...listJob,
        item: '登録候補あり',
        storeKey: 'akiba',
        status: 'held' as const,
        eventUUID: '550e8400-e29b-41d4-a716-446655440003',
        eventId: null,
        eventTitle: null,
        candidate: registeredRequest
      },
      {
        ...listJob,
        item: '登録済み',
        storeKey: 'akiba',
        status: 'registered' as const,
        eventUUID: '550e8400-e29b-41d4-a716-446655440004',
        eventTitle: '紐付け先の実イベント名'
      }
    ]
    const markup = await renderList([{ ...listJob, candidates }])
    const cell = eventNameCell(markup)
    // 抽出名のみ → 抽出名、登録候補あり → AI が付けた題(抽出名ではない)、登録済み → 登録イベントの題。
    expect(cell).toContain('<span>抽出名のみ</span>')
    expect(cell).toContain('<span>AI が付けた題</span>')
    expect(cell).not.toContain('登録候補あり')
    expect(cell).toMatch(
      /<a\b[^>]*href="\/events\/550e8400-e29b-41d4-a716-446655440000"[^>]*>紐付け先の実イベント名<\/a>/
    )
    expect(cell).not.toContain('<span>登録済み</span>')
  })
})

describe('項目別のしきい値の反映', () => {
  const announce = (probability: number): WebhookJob => ({
    ...listJob,
    postStatus: 'announce',
    postStatusProbability: probability
  })

  test('受信履歴の未確定は status の項目別しきい値（共通値ではない）で決まる', async () => {
    // 共通値 90% でも、status が 80% なら 0.85 は確定として通常表示する。
    const confirmed = await renderList([announce(0.85)], 0.9, { status: 0.8 })
    expect(statusCell(confirmed)).toContain('>告知</td>')
    expect(statusCell(confirmed)).not.toContain('text-muted-foreground')
    expect(statusCell(confirmed)).not.toContain('title=')
    // status を 90% にすると、同じ 0.85 が未確定になり、理由に status のしきい値を出す。
    const tentative = await renderList([announce(0.85)], 0.9, { status: 0.9 })
    expect(statusCell(tentative)).toContain('text-muted-foreground')
    expect(statusCell(tentative)).toContain('title="確信度がしきい値(90%)未満のため未確定"')
    const below = await renderList([announce(0.79)], 0.9, { status: 0.8 })
    expect(statusCell(below)).toContain('title="確信度がしきい値(80%)未満のため未確定"')
    // 他の項目のしきい値は一覧の未確定に影響しない。
    const other = await renderList([announce(0.85)], 0.9, { status: 0.8, category: 0.99 })
    expect(statusCell(other)).not.toContain('title=')
  })

  test('受信詳細の回答表は項目別のしきい値と確定を出す（状態 80%、配布物 90%）', async () => {
    const answers: Record<string, ClefAnswer> = {
      status: { type: 'choice', choice: 'announce', probabilities: { announce: 0.8536, start: 0.1 } },
      category: { type: 'choice', choice: 'other', probabilities: { other: 0.85, none: 0.1 } }
    }
    const markup = await renderDetail({ ...listJob, answers }, 0.9, { status: 0.8 })
    const rows = answerRows(markup)
    const cells = (key: string) => {
      const row = rows.find((entry) => entry.includes(`>${key}</td>`))
      if (row === undefined) throw new Error(`Missing row ${key}`)
      return [...row.matchAll(/<td\b[^>]*>(.*?)<\/td>/g)].map((match) => match[1])
    }
    expect(cells('状態')[3]).toBe('<span class="font-mono tabular-nums leading-[0]">80.0%</span>')
    expect(cells('状態')[4]).toContain('確定')
    expect(cells('配布物')[3]).toBe('<span class="font-mono tabular-nums leading-[0]">90.0%</span>')
    expect(cells('配布物')[4]).toContain('未確定')
  })
})

test('一覧と詳細は一部登録・一部保留を配布物ごとに表示し、元投稿を維持する', async () => {
  const candidates = [
    {
      ...listJob,
      item: 'ハロウィン限定名刺',
      storeKey: 'akiba',
      status: 'held' as const,
      eventId: null,
      eventTitle: null,
      post: { ...listJob.post, text: '名刺に関する原文断片' }
    },
    {
      ...listJob,
      item: 'ハロウィンアクキー',
      storeKey: 'akiba',
      status: 'registered' as const,
      eventUUID: '550e8400-e29b-41d4-a716-446655440002',
      eventTitle: 'ハロウィンアクキー'
    }
  ]
  const job: WebhookJob = { ...listJob, candidates, post: { ...listJob.post, text: 'アクキーと名刺の元投稿全文' } }
  const list = await renderList([job])
  expect(list).toContain('ハロウィン限定名刺')
  expect(list).toContain('ハロウィンアクキー')
  const detail = await renderDetail(job)
  expect(detail).toContain('識別されたイベント')
  expect(detail).toContain('aria-pressed="true"')
  expect(detail).toContain('aria-pressed="false"')
  expect(detail).toContain('アクキーと名刺の元投稿全文')
  expect(detail).not.toContain('名刺に関する原文断片')
  // 「登録イベント」リンクは編集画面ではなくイベント詳細ページへ向ける。
  expect(detail).toContain('href="/events/550e8400-e29b-41d4-a716-446655440000"')
  expect(detail).not.toMatch(/\/admin\/events\/(?!new)/)
  for (const label of ['補完して登録', '既存へ紐付け', '対象外にする', 'AI で判定し直す', '通知を再送'])
    expect(detail).toContain(label)
})

describe('受信詳細の先頭ボタン（補完して登録 / 編集）', () => {
  // どちらも <a> で出る。ボタンの見た目は data-slot="button" の a から取る。
  const registerAnchor = (markup: string) => anchorsOf(markup).find((anchor) => anchor.includes('補完して登録'))
  const editAnchor = (markup: string) => anchorsOf(markup).find((anchor) => anchor.endsWith('編集</a>'))
  const firstButton = (markup: string) =>
    anchorsOf(markup).find((anchor) => anchor.includes('bg-brand text-brand-foreground'))
  const hrefOf = (anchor: string | undefined) => {
    const href = anchor?.match(/href="([^"]*)"/)?.[1]
    if (href === undefined) throw new Error('Missing href')
    return new URL(href.replaceAll('&amp;', '&'), 'https://example.invalid')
  }

  test('イベント作成ページ（/admin/events/new）へのリンクで、元投稿URLと下書きを初期値に渡す', async () => {
    const anchor = registerAnchor(
      await renderDetail({
        ...listJob,
        draft: { title: '新東たん アクリルスタンド配布', category: 'acsta', stores: ['shintou'], conditions: [] }
      })
    )
    expect(anchor).toContain('data-slot="button"')
    const url = hrefOf(anchor)
    expect(url.pathname).toBe('/admin/events/new')
    expect(url.searchParams.get('referenceUrls')).toBe(listJob.sourceUrl)
    expect(url.searchParams.get('title')).toBe('新東たん アクリルスタンド配布')
    expect(url.searchParams.get('category')).toBe('acsta')
    expect(url.searchParams.get('stores')).toBe('shintou')
  })

  test('保留・対象外・失敗は無効にならず、「補完して登録」のリンクとして出る', async () => {
    for (const status of ['held', 'ignored', 'failed'] as const) {
      const markup = await renderDetail({ ...listJob, status })
      const anchor = registerAnchor(markup)
      expect(anchor).toBeDefined()
      expect(anchor).toContain('href="/admin/events/new?')
      // class の disabled: 修飾子とは区別し、属性としての disabled / aria-disabled が無いことを見る。
      expect(anchor).not.toMatch(/\sdisabled[\s=>]/)
      expect(anchor).not.toContain('aria-disabled')
      expect(editAnchor(markup)).toBeUndefined()
    }
  })

  test('登録済みでイベントIDがあれば、同じ位置のボタンが「編集」になり、編集画面へ直接向かう', async () => {
    const eventId = '550e8400-e29b-41d4-a716-4466554400aa'
    const markup = await renderDetail({ ...listJob, status: 'registered', eventId })
    const anchor = editAnchor(markup)
    expect(anchor).toContain(`href="/admin/events/${eventId}/edit"`)
    expect(anchor).toContain('data-slot="button"')
    expect(anchor).toContain('bg-brand text-brand-foreground')
    expect(anchor).toContain('lucide-pencil')
    expect(anchor).not.toMatch(/\sdisabled[\s=>]/)
    // ラベルに対象名は足さず、同じ描画に「補完して登録」は出さない。
    expect(anchor).toContain('編集</a>')
    expect(anchor).not.toContain(listJob.eventTitle)
    expect(markup).not.toContain('補完して登録')
    // 位置と見た目は変えない。先頭のブランド色ボタンがそのまま「編集」になる。
    expect(firstButton(markup)).toBe(anchor)
    // 登録イベントの行内・判定欄のリンクは、編集ではなくイベント詳細へ向けたまま。
    expect(markup).toContain(`href="/events/${eventId}"`)
  })

  test('登録済みでもイベントIDが無ければ従来どおり「補完して登録」に倒す', async () => {
    const markup = await renderDetail({ ...listJob, status: 'registered', eventId: null, eventTitle: null })
    expect(registerAnchor(markup)).toContain('href="/admin/events/new?')
    expect(editAnchor(markup)).toBeUndefined()
  })

  test('登録済みの候補を先頭にすると「編集」、保留の候補を先頭にすると「補完して登録」になる', async () => {
    const registered = {
      ...listJob,
      item: 'ハロウィンアクキー',
      storeKey: 'akiba',
      status: 'registered' as const,
      eventUUID: '550e8400-e29b-41d4-a716-446655440002',
      eventId: '550e8400-e29b-41d4-a716-4466554400bb'
    }
    const held = { ...listJob, item: 'ハロウィン限定名刺', storeKey: 'akiba', status: 'held' as const }
    const registeredFirst = await renderDetail({ ...listJob, candidates: [registered, held] })
    expect(editAnchor(registeredFirst)).toContain(`href="/admin/events/${registered.eventId}/edit"`)
    expect(registerAnchor(registeredFirst)).toBeUndefined()
    const heldFirst = await renderDetail({ ...listJob, candidates: [held, registered] })
    expect(registerAnchor(heldFirst)).toContain('href="/admin/events/new?')
    expect(editAnchor(heldFirst)).toBeUndefined()
  })

  test('識別されたイベントが複数あるとき、選択中（先頭）の候補の下書きを初期値にする', async () => {
    const candidates = [
      {
        ...listJob,
        item: '名刺',
        storeKey: 'akiba',
        draft: { title: 'ハロウィン限定名刺', stores: ['akiba'], conditions: [] }
      },
      {
        ...listJob,
        item: 'アクキー',
        storeKey: 'akiba',
        eventUUID: '550e8400-e29b-41d4-a716-446655440002',
        draft: { title: 'ハロウィンアクキー', stores: ['shintou'], conditions: [] }
      }
    ]
    const url = hrefOf(registerAnchor(await renderDetail({ ...listJob, candidates })))
    // 登録候補が無く下書きだけのとき、題は下書きの定型題（店舗名・「配布」入り）ではなく、選択中の候補の抽出名にする。
    expect(url.searchParams.get('title')).toBe('名刺')
    expect(url.searchParams.get('stores')).toBe('akiba')
  })
})

describe('識別されたイベント一覧の見た目', () => {
  const candidates = ['名刺', 'アクキー', 'コースター'].map((item, index) => ({
    ...listJob,
    item,
    storeKey: 'akiba',
    eventUUID: `550e8400-e29b-41d4-a716-44665544010${index}`
  }))
  const listOf = async () => {
    const markup = await renderDetail({ ...listJob, candidates })
    const section = markup.match(/<section[^>]*aria-label="識別されたイベント"[^>]*>.*?<\/section>/)?.[0]
    if (section === undefined) throw new Error('Missing candidate section')
    return section
  }

  test('行は区切り線ではなく gap で離し、未選択行に影（ring）を付けない', async () => {
    const section = await listOf()
    const ul = section.match(/<ul\b[^>]*class="([^"]*)"/)?.[1]
    expect(ul).toContain('flex-col')
    expect(ul).toContain('gap-1.5')
    expect(ul).not.toContain('divide-')
    const items = [...section.matchAll(/<li\b[^>]*class="([^"]*)"/g)].map((match) => match[1])
    expect(items).toHaveLength(3)
    // 選択中は ring-1 で縁取り、未選択は ring と shadow を明示的に消す。
    expect(items[0]).toContain('ring-1')
    for (const item of items.slice(1)) {
      expect(item).toContain('ring-0')
      expect(item).toContain('shadow-none')
      expect(item).not.toContain('ring-1')
    }
    // キーボード操作の目印は影の ring ではなく outline にする。
    for (const item of items) {
      expect(item).toContain('has-[button:focus-visible]:outline-2')
      expect(item).not.toContain('has-[button:focus-visible]:ring')
    }
  })
})
