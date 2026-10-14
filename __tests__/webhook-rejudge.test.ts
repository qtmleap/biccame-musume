import { afterEach, describe, expect, setSystemTime, test } from 'bun:test'
import type { ClefAnswer } from '@biccame/shared/event-detect/clef'
import {
  type WebhookJob,
  WebhookJobStatusSchema,
  WebhookNotificationStatusSchema
} from '@biccame/shared/schemas/webhook.dto'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebhookJobDetail } from '@/components/admin/webhook-job-detail'
import {
  isWebhookJobInProgress,
  WEBHOOK_JOB_POLL_INTERVAL_MS,
  WEBHOOK_JOB_POLL_TIMEOUT_MS,
  webhookActionAvailability,
  webhookJobPoll
} from '@/components/admin/webhook-labels'
import { ADMIN_WEBHOOK_QUERY_KEY, useAdminWebhookJob, useRejudgeAdminWebhookJob } from '@/hooks/use-admin-webhooks'
import { adminEndpoints } from '@/utils/client/admin'

const postId = '1000000000000000001'
const baseJob: WebhookJob = {
  candidates: [],
  postId,
  post: {
    id: postId,
    createdAt: '2026-10-02T03:00:00.000Z',
    screenName: 'synthetic_account',
    kind: 'original',
    text: '再判定の確認に使う投稿本文',
    url: `https://example.invalid/post/${postId}`,
    media: []
  },
  sourceUrl: `https://example.invalid/post/${postId}`,
  eventUUID: '550e8400-e29b-41d4-a716-446655440001',
  status: 'held',
  reasons: [],
  candidate: null,
  confidence: 0.72,
  model: 'clef-flash',
  questionVersion: 'test-v1',
  eventId: null,
  eventTitle: null,
  postStatus: 'announce',
  postStatusProbability: 0.75,
  answers: null,
  draft: null,
  attempts: 1,
  notificationStatus: 'sent',
  notificationId: null,
  notificationError: null,
  notificationAttempts: 1,
  lastError: null,
  createdAt: '2026-10-05T03:00:00.000Z',
  updatedAt: '2026-10-05T03:00:00.000Z',
  judgedAt: null
}

/** 詳細画面を描画する。job が null のときは読み込み前（取得データなし）の画面になる。 */
const renderDetail = async (job: WebhookJob | null) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (job !== null) queryClient.setQueryData([...ADMIN_WEBHOOK_QUERY_KEY, job.postId], job)
  const routeTree = createRootRoute({ component: () => createElement(WebhookJobDetail, { postId }) })
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

type ButtonState = 'missing' | 'disabled' | 'enabled'

/** 受信詳細の操作ボタンのラベル。画面側の文言とは別に、ここで固定する。 */
const RETRY_LABEL = '失敗した処理を再実行'
const REJUDGE_LABEL = 'AI で判定し直す'
/** 保留（canResolve）のときだけ有効になるボタン。状態で可否が変わるボタンの見本に使う。 */
const LINK_LABEL = '既存へ紐付け'
/** イベント作成ページへ遷移するリンク。ボタンではなく <a> で、受信ジョブの状態に関係なく常に押せる。 */
const CREATE_LABEL = '補完して登録'

/** ラベルを含むボタンの状態。描画されていなければ missing、disabled 属性があれば disabled。 */
const buttonState = (markup: string, label: string): ButtonState => {
  const button = [...markup.matchAll(/<button\b[^>]*>.*?<\/button>/g)]
    .map((match) => match[0])
    .find((markupOfButton) => markupOfButton.includes(label))
  if (button === undefined) return 'missing'
  return /^<button\b[^>]*\sdisabled=""/.test(button) ? 'disabled' : 'enabled'
}

type LinkInfo = { href: string | undefined; disabled: boolean }

/** ラベルを含む <a> の情報。描画されていなければ undefined。disabled は無効を示す属性（disabled / aria-disabled）の有無。 */
const linkOf = (markup: string, label: string): LinkInfo | undefined => {
  const link = [...markup.matchAll(/<a\b[^>]*>.*?<\/a>/g)]
    .map((match) => match[0])
    .find((markupOfLink) => markupOfLink.includes(label))
  if (link === undefined) return undefined
  const openTag = link.slice(0, link.indexOf('>') + 1)
  const href = /\shref="([^"]*)"/.exec(openTag)
  return {
    href: href === null ? undefined : href[1],
    disabled: /\s(disabled|aria-disabled)(=|\s|>)/.test(openTag)
  }
}

describe('保留・対象外ジョブの再判定', () => {
  test('再判定できるのは保留と、人が却下していない対象外のジョブだけで、通知状態には左右されない', () => {
    for (const status of WebhookJobStatusSchema.options) {
      for (const notificationStatus of ['pending', 'sent', 'failed', 'unknown', 'skipped']) {
        expect(webhookActionAvailability(status, notificationStatus, []).canRejudge).toBe(
          status === 'held' || status === 'ignored'
        )
        expect(webhookActionAvailability(status, notificationStatus, ['not_distribution_event']).canRejudge).toBe(
          status === 'held' || status === 'ignored'
        )
      }
    }
    expect(webhookActionAvailability('held', 'sent', [])).toEqual({
      canResolve: true,
      canRetryProcessing: false,
      canRejudge: true,
      canRetryNotification: false
    })
  })

  test('人が却下した対象外のジョブ（reasons に manually_rejected）は再判定できない。他の操作の規則は変わらない', () => {
    expect(webhookActionAvailability('ignored', 'skipped', ['manually_rejected'])).toEqual({
      canResolve: false,
      canRetryProcessing: false,
      canRejudge: false,
      canRetryNotification: false
    })
    expect(
      webhookActionAvailability('ignored', 'skipped', ['not_distribution_event', 'manually_rejected']).canRejudge
    ).toBe(false)
    // AI が対象外にしたジョブは、解決・通知再送の対象にはならないまま、再判定だけできる。
    expect(webhookActionAvailability('ignored', 'skipped', ['not_distribution_event'])).toEqual({
      canResolve: false,
      canRetryProcessing: false,
      canRejudge: true,
      canRetryNotification: false
    })
    for (const status of ['registered', 'queued', 'processing', 'failed']) {
      expect(webhookActionAvailability(status, 'sent', ['manually_rejected']).canRejudge).toBe(false)
    }
  })

  test('再判定のクライアントはボディなしのPOSTで、パスは管理APIの経路に一致する', () => {
    const endpoint = adminEndpoints.find((entry) => entry.alias === 'rejudgeAdminWebhookJob')
    expect(endpoint?.method).toBe('post')
    expect(endpoint?.path).toBe('/api/admin/webhook/jobs/:postId/rejudge')
    expect(endpoint?.parameters?.map((parameter) => [parameter.name, parameter.type])).toEqual([
      ['postId', 'Path'],
      ['candidateId', 'Query']
    ])
  })

  test('再判定のフックは実行関数を返し、実行前は待機中にならない', () => {
    const Probe = () => {
      const mutation = useRejudgeAdminWebhookJob()
      return createElement('p', null, `${typeof mutation.mutateAsync}:${mutation.isPending}`)
    }
    const queryClient = new QueryClient()
    try {
      expect(
        renderToStaticMarkup(createElement(QueryClientProvider, { client: queryClient }, createElement(Probe)))
      ).toBe('<p>function:false</p>')
    } finally {
      queryClient.clear()
    }
  })

  // ボタンの探し方が正しいことを、すでにある操作ボタンで確かめる。
  test('既存の操作ボタンは状態によらず描画され、使えるときだけ有効になる。「補完して登録」はリンクで常に押せる', async () => {
    const held = await renderDetail({ ...baseJob, status: 'held', notificationStatus: 'sent' })
    expect(buttonState(held, RETRY_LABEL)).toBe('disabled')
    expect(buttonState(held, LINK_LABEL)).toBe('enabled')
    const failed = await renderDetail({ ...baseJob, status: 'failed' })
    expect(buttonState(failed, RETRY_LABEL)).toBe('enabled')
    expect(buttonState(failed, LINK_LABEL)).toBe('disabled')
    expect(buttonState(await renderDetail(null), RETRY_LABEL)).toBe('disabled')
    const autoIgnored = await renderDetail({
      ...baseJob,
      status: 'ignored',
      notificationStatus: 'skipped',
      reasons: ['not_distribution_event']
    })
    // 「補完して登録」はイベント作成ページへ遷移するだけの <a> で、受信ジョブの状態に関係なく常に押せる。
    for (const markup of [held, failed, autoIgnored]) {
      const link = linkOf(markup, CREATE_LABEL)
      expect(link).toBeDefined()
      expect(link?.href?.startsWith('/admin/events/new')).toBe(true)
      expect(link?.disabled).toBe(false)
      expect(buttonState(markup, CREATE_LABEL)).toBe('missing')
    }
  })

  test('「AI で判定し直す」ボタンは状態によらず常に描画され、保留と対象外のときだけ有効になる', async () => {
    for (const status of WebhookJobStatusSchema.options) {
      expect(buttonState(await renderDetail({ ...baseJob, status }), REJUDGE_LABEL)).toBe(
        status === 'held' || status === 'ignored' ? 'enabled' : 'disabled'
      )
    }
  })

  test('人が却下した対象外のジョブでは「AI で判定し直す」ボタンが描画されたまま無効になり、AI が対象外にしたジョブでは有効になる', async () => {
    const autoIgnored = await renderDetail({
      ...baseJob,
      status: 'ignored',
      notificationStatus: 'skipped',
      reasons: ['not_distribution_event']
    })
    expect(buttonState(autoIgnored, REJUDGE_LABEL)).toBe('enabled')
    const rejected = await renderDetail({
      ...baseJob,
      status: 'ignored',
      notificationStatus: 'skipped',
      reasons: ['manually_rejected']
    })
    expect(buttonState(rejected, REJUDGE_LABEL)).toBe('disabled')
    // 他のボタンの規則は変わらない（対象外のジョブは解決・再試行・通知再送を持たない）。
    expect(buttonState(autoIgnored, LINK_LABEL)).toBe('disabled')
    expect(buttonState(autoIgnored, RETRY_LABEL)).toBe('disabled')
    expect(buttonState(autoIgnored, '通知を再送')).toBe('disabled')
  })

  test('「AI で判定し直す」ボタンは通知状態によらず、保留なら有効になる', async () => {
    for (const notificationStatus of WebhookNotificationStatusSchema.options) {
      expect(buttonState(await renderDetail({ ...baseJob, status: 'held', notificationStatus }), REJUDGE_LABEL)).toBe(
        'enabled'
      )
    }
  })

  test('読み込み前でも「AI で判定し直す」ボタンは隠れず、無効のまま描画される', async () => {
    expect(buttonState(await renderDetail(null), REJUDGE_LABEL)).toBe('disabled')
  })

  test('「AI で判定し直す」ボタンは「失敗した処理を再実行」と「通知を再送」の間に置かれる', async () => {
    const markup = await renderDetail({ ...baseJob, status: 'held' })
    const retry = markup.indexOf(RETRY_LABEL)
    const rejudge = markup.indexOf(REJUDGE_LABEL)
    const notification = markup.indexOf('通知を再送')
    expect(retry).toBeGreaterThan(-1)
    expect(rejudge).toBeGreaterThan(retry)
    expect(notification).toBeGreaterThan(rejudge)
  })

  test('2つのボタンは状態によらず常に描画され、旧文言（「判定を再試行」「再判定」）のボタンは出ない', async () => {
    const screens = [
      ...(await Promise.all(WebhookJobStatusSchema.options.map((status) => renderDetail({ ...baseJob, status })))),
      await renderDetail(null)
    ]
    for (const markup of screens) {
      expect(buttonState(markup, RETRY_LABEL)).not.toBe('missing')
      expect(buttonState(markup, REJUDGE_LABEL)).not.toBe('missing')
      // 旧文言はボタンの文言にも説明（title）にも残らない。
      expect(buttonState(markup, '判定を再試行')).toBe('missing')
      expect(buttonState(markup, '再判定')).toBe('missing')
    }
  })

  test('2つのボタンには、違いが分かる説明（title）が無効のときも付く', async () => {
    const enabled = await renderDetail({ ...baseJob, status: 'failed' })
    const disabled = await renderDetail({ ...baseJob, status: 'registered' })
    for (const markup of [enabled, disabled]) {
      expect(markup).toContain('title="処理に失敗した投稿を、もう一度処理します（保存済みの判定結果があれば再利用）"')
      expect(markup).toContain('title="保存済みの回答を消して、AI で判定し直します"')
    }
  })
})

describe('Webhook詳細の自動更新（進行中の判定）', () => {
  test('判定待ち（queued / processing）は通知状態によらず進行中、保留・登録済みは通知待ち(pending)のときだけ進行中', () => {
    for (const notificationStatus of WebhookNotificationStatusSchema.options) {
      expect(isWebhookJobInProgress('queued', notificationStatus)).toBe(true)
      expect(isWebhookJobInProgress('processing', notificationStatus)).toBe(true)
      for (const status of ['held', 'registered']) {
        expect(isWebhookJobInProgress(status, notificationStatus)).toBe(notificationStatus === 'pending')
      }
    }
  })

  test('対象外と処理失敗は、通知が pending のままでも進行中にしない', () => {
    for (const notificationStatus of WebhookNotificationStatusSchema.options) {
      expect(isWebhookJobInProgress('ignored', notificationStatus)).toBe(false)
      expect(isWebhookJobInProgress('failed', notificationStatus)).toBe(false)
    }
  })

  test('通知が終端（sent / skipped / failed / unknown）の保留・登録済みは進行中にしない', () => {
    for (const status of ['held', 'registered']) {
      for (const notificationStatus of ['sent', 'skipped', 'failed', 'unknown']) {
        expect(isWebhookJobInProgress(status, notificationStatus)).toBe(false)
      }
    }
  })

  test('未知の状態は進行中にしない（張り付かない）', () => {
    expect(isWebhookJobInProgress('future_state', 'pending')).toBe(false)
    expect(isWebhookJobInProgress('held', 'future_state')).toBe(false)
  })
})

describe('Webhook詳細の自動更新（再取得間隔の決定）', () => {
  const start = 1_000_000
  const queued = { status: 'queued', notificationStatus: 'pending' }

  test('進行中は起点から3分未満の間だけ2秒間隔にし、3分に達したら止める', () => {
    expect(WEBHOOK_JOB_POLL_INTERVAL_MS).toBe(2000)
    expect(WEBHOOK_JOB_POLL_TIMEOUT_MS).toBe(180_000)
    const first = webhookJobPoll(null, queued, start)
    expect(first).toEqual({ window: { phase: 'judging', startedAt: start }, interval: 2000 })
    const almost = webhookJobPoll(first.window, queued, start + WEBHOOK_JOB_POLL_TIMEOUT_MS - 1)
    expect(almost.interval).toBe(2000)
    const expired = webhookJobPoll(first.window, queued, start + WEBHOOK_JOB_POLL_TIMEOUT_MS)
    expect(expired.interval).toBe(false)
    // 打ち切り後に何度評価しても、同じ起点のまま止まり続ける（再開しない）。
    const later = webhookJobPoll(expired.window, queued, start + WEBHOOK_JOB_POLL_TIMEOUT_MS * 2)
    expect(later).toEqual({ window: first.window, interval: false })
  })

  test('データが無い、または進行中でなければ止めて起点を捨てる', () => {
    expect(webhookJobPoll(null, undefined, start)).toEqual({ window: null, interval: false })
    const running = webhookJobPoll(null, queued, start)
    for (const job of [
      { status: 'ignored', notificationStatus: 'skipped' },
      { status: 'failed', notificationStatus: 'pending' },
      { status: 'held', notificationStatus: 'sent' },
      { status: 'registered', notificationStatus: 'failed' }
    ]) {
      expect(webhookJobPoll(running.window, job, start + 1000)).toEqual({ window: null, interval: false })
    }
    expect(webhookJobPoll(running.window, undefined, start + 1000)).toEqual({ window: null, interval: false })
  })

  test('進行中でなくなったあとに再判定すると、また3分使える', () => {
    const expired = webhookJobPoll(webhookJobPoll(null, queued, start).window, queued, start + 200_000)
    expect(expired.interval).toBe(false)
    const done = webhookJobPoll(expired.window, { status: 'ignored', notificationStatus: 'skipped' }, start + 210_000)
    expect(done.window).toBeNull()
    const again = webhookJobPoll(done.window, queued, start + 300_000)
    expect(again).toEqual({ window: { phase: 'judging', startedAt: start + 300_000 }, interval: 2000 })
  })

  test('queued → processing → 通知待ちと進んでも起点は数え直さず、合計で3分に達したら止める', () => {
    const first = webhookJobPoll(null, queued, start)
    const processing = webhookJobPoll(
      first.window,
      { status: 'processing', notificationStatus: 'pending' },
      start + 60_000
    )
    expect(processing.window).toEqual({ phase: 'judging', startedAt: start })
    const notifying = webhookJobPoll(
      processing.window,
      { status: 'held', notificationStatus: 'pending' },
      start + 120_000
    )
    expect(notifying).toEqual({ window: { phase: 'notifying', startedAt: start }, interval: 2000 })
    const expired = webhookJobPoll(notifying.window, { status: 'held', notificationStatus: 'pending' }, start + 180_000)
    expect(expired.interval).toBe(false)
  })

  test('通知待ちで打ち切られた後に再判定して判定待ちへ戻ると、起点を取り直して再び再取得する', () => {
    const waiting = { status: 'held', notificationStatus: 'pending' }
    const first = webhookJobPoll(null, waiting, start)
    const expired = webhookJobPoll(first.window, waiting, start + WEBHOOK_JOB_POLL_TIMEOUT_MS)
    expect(expired.interval).toBe(false)
    const rejudged = webhookJobPoll(expired.window, queued, start + WEBHOOK_JOB_POLL_TIMEOUT_MS + 5000)
    expect(rejudged).toEqual({
      window: { phase: 'judging', startedAt: start + WEBHOOK_JOB_POLL_TIMEOUT_MS + 5000 },
      interval: 2000
    })
  })

  test('判定待ちで打ち切られた後は、手動で再取得して同じ判定待ちが続いても再開しない', () => {
    const first = webhookJobPoll(null, queued, start)
    const expired = webhookJobPoll(first.window, queued, start + WEBHOOK_JOB_POLL_TIMEOUT_MS)
    expect(expired.interval).toBe(false)
    expect(
      webhookJobPoll(expired.window, { status: 'processing', notificationStatus: 'pending' }, start + 200_000)
    ).toEqual({
      window: { phase: 'judging', startedAt: start },
      interval: false
    })
  })
})

describe('Webhook詳細の自動更新（フックの再取得設定）', () => {
  afterEach(() => setSystemTime())

  const queryKey = [...ADMIN_WEBHOOK_QUERY_KEY, postId]
  /** useAdminWebhookJob を描画して、キャッシュ上のクエリに登録された refetchInterval を取り出す。 */
  const mountHook = (job: WebhookJob) => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(queryKey, job)
    const Probe = () => {
      useAdminWebhookJob(postId)
      return null
    }
    renderToStaticMarkup(createElement(QueryClientProvider, { client: queryClient }, createElement(Probe)))
    const query = queryClient.getQueryCache().find<WebhookJob>({ queryKey })
    if (query === undefined) throw new Error('query was not registered')
    // Query.options の型には refetchInterval が無い（実体は observer のオプション）ため、in で絞って取り出す。
    const { options } = query
    if (!('refetchInterval' in options) || typeof options.refetchInterval !== 'function') {
      throw new Error('refetchInterval must be a function')
    }
    const { refetchInterval } = options
    return {
      queryClient,
      refetchIntervalInBackground:
        'refetchIntervalInBackground' in options ? options.refetchIntervalInBackground : null,
      /** 取得結果が job に変わったものとして、次の再取得間隔を評価する。 */
      next: (nextJob: WebhookJob): unknown => {
        queryClient.setQueryData(queryKey, nextJob)
        return refetchInterval(query)
      },
      current: (): unknown => refetchInterval(query)
    }
  }

  test('進行中の間だけ2秒間隔で再取得し、3分で止め、背景タブでは動かさない', () => {
    setSystemTime(dayjs('2026-10-13T00:00:00Z').toDate())
    const hook = mountHook({ ...baseJob, status: 'queued', notificationStatus: 'pending' })
    try {
      expect(hook.refetchIntervalInBackground).toBe(false)
      expect(hook.current()).toBe(2000)
      setSystemTime(dayjs('2026-10-13T00:02:59Z').toDate())
      expect(hook.next({ ...baseJob, status: 'processing', notificationStatus: 'pending' })).toBe(2000)
      setSystemTime(dayjs('2026-10-13T00:03:00Z').toDate())
      expect(hook.current()).toBe(false)
    } finally {
      hook.queryClient.clear()
    }
  })

  test('判定が終われば止まり、次の再判定ではまた3分使える。取得前（データなし）は動かさない', () => {
    setSystemTime(dayjs('2026-10-13T00:00:00Z').toDate())
    const hook = mountHook({ ...baseJob, status: 'queued', notificationStatus: 'pending' })
    try {
      expect(hook.next({ ...baseJob, status: 'held', notificationStatus: 'pending' })).toBe(2000)
      expect(hook.next({ ...baseJob, status: 'held', notificationStatus: 'sent' })).toBe(false)
      setSystemTime(dayjs('2026-10-13T00:10:00Z').toDate())
      expect(hook.next({ ...baseJob, status: 'queued', notificationStatus: 'sent' })).toBe(2000)
      setSystemTime(dayjs('2026-10-13T00:12:59Z').toDate())
      expect(hook.current()).toBe(2000)
      setSystemTime(dayjs('2026-10-13T00:13:00Z').toDate())
      expect(hook.current()).toBe(false)
    } finally {
      hook.queryClient.clear()
    }
  })

  test('処理失敗と対象外では再取得しない', () => {
    const hook = mountHook({ ...baseJob, status: 'failed', notificationStatus: 'pending' })
    try {
      expect(hook.current()).toBe(false)
      expect(hook.next({ ...baseJob, status: 'ignored', notificationStatus: 'skipped' })).toBe(false)
    } finally {
      hook.queryClient.clear()
    }
  })
})

const answers: Record<string, ClefAnswer> = {
  is_event: { type: 'noul', noul: 0.7224 },
  status: { type: 'choice', choice: 'announce', probabilities: { announce: 0.7499, start: 0.15, none: 0.05 } }
}
const JUDGING_NOTICE = '判定中です。結果が出ると自動で更新されます。'

describe('Webhook詳細の判定待ち表示', () => {
  test('判定待ち（queued / processing）は回答表の場所に案内を出し、「回答の記録なし」は出さない', async () => {
    for (const status of ['queued', 'processing'] as const) {
      const markup = await renderDetail({ ...baseJob, status, notificationStatus: 'pending', answers: null })
      expect(markup).toContain(JUDGING_NOTICE)
      expect(markup).not.toContain('回答の記録なし')
      expect(markup).not.toContain('<table')
      // 案内は「Clef の回答」の見出しの直後（元投稿と判定・イベント登録の間）に出る。
      expect(markup.indexOf('元投稿')).toBeLessThan(markup.indexOf('Clef の回答'))
      expect(markup.indexOf('Clef の回答')).toBeLessThan(markup.indexOf(JUDGING_NOTICE))
      expect(markup.indexOf(JUDGING_NOTICE)).toBeLessThan(markup.indexOf('判定・イベント登録'))
    }
  })

  test('判定が終わったジョブは従来どおり、回答があれば表、無ければ「回答の記録なし」を出す', async () => {
    for (const status of ['held', 'ignored', 'registered', 'failed'] as const) {
      const withAnswers = await renderDetail({ ...baseJob, status, notificationStatus: 'sent', answers })
      expect(withAnswers).toContain('aria-label="Clef の回答"')
      expect(withAnswers).not.toContain(JUDGING_NOTICE)
      const without = await renderDetail({ ...baseJob, status, notificationStatus: 'sent', answers: null })
      expect(without).toContain('回答の記録なし')
      expect(without).not.toContain(JUDGING_NOTICE)
    }
  })

  test('判定待ちでも操作ボタンの可否は変えない（再判定は押せないまま）', async () => {
    const markup = await renderDetail({ ...baseJob, status: 'queued', notificationStatus: 'pending' })
    expect(buttonState(markup, REJUDGE_LABEL)).toBe('disabled')
    expect(buttonState(markup, LINK_LABEL)).toBe('disabled')
  })
})
