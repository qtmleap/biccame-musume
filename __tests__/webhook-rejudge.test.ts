import { describe, expect, test } from 'bun:test'
import { WebhookJobStatusSchema, WebhookNotificationStatusSchema } from '@biccame/shared/schemas/webhook.dto'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  isWebhookJobInProgress,
  WEBHOOK_JOB_POLL_INTERVAL_MS,
  WEBHOOK_JOB_POLL_TIMEOUT_MS,
  webhookActionAvailability,
  webhookJobPoll
} from '@/components/admin/webhook-labels'
import { useRejudgeAdminWebhookJob } from '@/hooks/use-admin-webhooks'
import { adminEndpoints } from '@/utils/client/admin'
import {
  baseJob,
  buttonState,
  CREATE_LABEL,
  LINK_LABEL,
  linkOf,
  REJUDGE_LABEL,
  RETRY_LABEL,
  renderDetail
} from './fixtures/webhook-rejudge'

describe('保留・対象外ジョブの再判定', () => {
  test('手動連携は保留・対象外・登録済み（付け替え）で許可し、処理中・失敗の制限は広げない', async () => {
    for (const status of WebhookJobStatusSchema.options) {
      const expected = status === 'held' || status === 'ignored' || status === 'registered'
      expect(webhookActionAvailability(status, 'skipped', []).canLink).toBe(expected)
      expect(webhookActionAvailability(status, 'skipped', []).canResolve).toBe(status === 'held')
      expect(buttonState(await renderDetail({ ...baseJob, status }), LINK_LABEL)).toBe(
        expected ? 'enabled' : 'disabled'
      )
    }
  })

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
      canLink: true,
      canRetryProcessing: false,
      canRejudge: true,
      canRecheck: false,
      canRetryNotification: false
    })
  })

  test('人が却下した対象外のジョブ（reasons に manually_rejected）は再判定できない。他の操作の規則は変わらない', () => {
    expect(webhookActionAvailability('ignored', 'skipped', ['manually_rejected'])).toEqual({
      canResolve: false,
      canLink: true,
      canRetryProcessing: false,
      canRejudge: false,
      canRecheck: false,
      canRetryNotification: false
    })
    expect(
      webhookActionAvailability('ignored', 'skipped', ['not_distribution_event', 'manually_rejected']).canRejudge
    ).toBe(false)
    // AI が対象外にしたジョブは、解決・通知再送の対象にはならないまま、再判定だけできる。
    expect(webhookActionAvailability('ignored', 'skipped', ['not_distribution_event'])).toEqual({
      canResolve: false,
      canLink: true,
      canRetryProcessing: false,
      canRejudge: true,
      canRecheck: false,
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
    // 対象外でも手動連携は可能だが、処理・通知の再送は許可しない。
    expect(buttonState(autoIgnored, LINK_LABEL)).toBe('enabled')
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
