import { describe, expect, test } from 'bun:test'
import { WebhookJobStatusSchema, WebhookNotificationStatusSchema } from '@biccame/shared/schemas/webhook.dto'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { webhookActionAvailability } from '@/components/admin/webhook-labels'
import { useRecheckAdminWebhookJob } from '@/hooks/use-admin-webhooks'
import { adminEndpoints } from '@/utils/client/admin'
import { baseJob, buttonState, LINK_LABEL, REJUDGE_LABEL, RETRY_LABEL, renderDetail } from './fixtures/webhook-rejudge'

const RECHECK_LABEL = '判定を再確認'
const linked = ['manually_linked']
const rejected = ['manually_rejected']
const auto = ['title_generated']

describe('確認用の再判定の操作の可否', () => {
  test('canRecheck は登録済みのときだけ真で、通知状態にも理由にも左右されない', () => {
    for (const status of WebhookJobStatusSchema.options) {
      for (const notificationStatus of WebhookNotificationStatusSchema.options) {
        for (const reasons of [[], linked, rejected, auto, ['needs_review']]) {
          expect(webhookActionAvailability(status, notificationStatus, reasons).canRecheck).toBe(
            status === 'registered'
          )
        }
      }
    }
  })

  test.each([
    ['registered + 自動登録', 'registered', auto, { canRejudge: false, canRecheck: true }],
    ['registered + manually_linked', 'registered', linked, { canRejudge: true, canRecheck: true }],
    ['held', 'held', ['needs_review'], { canRejudge: true, canRecheck: false }],
    ['ignored', 'ignored', ['not_distribution_event'], { canRejudge: true, canRecheck: false }],
    ['ignored + manually_rejected', 'ignored', rejected, { canRejudge: false, canRecheck: false }],
    ['failed', 'failed', [], { canRejudge: false, canRecheck: false }],
    ['queued', 'queued', [], { canRejudge: false, canRecheck: false }],
    ['processing', 'processing', [], { canRejudge: false, canRecheck: false }]
  ])('%s', (_label, status, reasons, expected) => {
    expect(webhookActionAvailability(status, 'sent', reasons)).toMatchObject(expected)
  })

  test('既存の操作の規則は変わらず、canRecheck が増えただけ', () => {
    expect(webhookActionAvailability('registered', 'failed', auto)).toEqual({
      canResolve: false,
      canLink: true,
      canRetryProcessing: false,
      canRejudge: false,
      canRecheck: true,
      canRetryNotification: true
    })
    expect(webhookActionAvailability('held', 'sent', ['needs_review'])).toEqual({
      canResolve: true,
      canLink: true,
      canRetryProcessing: false,
      canRejudge: true,
      canRecheck: false,
      canRetryNotification: false
    })
    expect(webhookActionAvailability('failed', 'pending', [])).toEqual({
      canResolve: false,
      canLink: false,
      canRetryProcessing: true,
      canRejudge: false,
      canRecheck: false,
      canRetryNotification: false
    })
  })
})

describe('受信詳細の「判定を再確認」ボタン', () => {
  test('登録済みでは自動登録でも手動連携でも有効で、通常の再判定は手動連携のときだけ有効のまま', async () => {
    const autoMarkup = await renderDetail({ ...baseJob, status: 'registered', reasons: auto })
    expect(buttonState(autoMarkup, RECHECK_LABEL)).toBe('enabled')
    expect(buttonState(autoMarkup, REJUDGE_LABEL)).toBe('disabled')
    const linkedMarkup = await renderDetail({ ...baseJob, status: 'registered', reasons: linked })
    expect(buttonState(linkedMarkup, RECHECK_LABEL)).toBe('enabled')
    expect(buttonState(linkedMarkup, REJUDGE_LABEL)).toBe('enabled')
  })

  test('保留・対象外・待機・処理中・失敗では隠さず無効で出す。読み込み前も無効', async () => {
    for (const status of WebhookJobStatusSchema.options) {
      expect(buttonState(await renderDetail({ ...baseJob, status }), RECHECK_LABEL)).toBe(
        status === 'registered' ? 'enabled' : 'disabled'
      )
    }
    expect(buttonState(await renderDetail({ ...baseJob, status: 'ignored', reasons: rejected }), RECHECK_LABEL)).toBe(
      'disabled'
    )
    expect(buttonState(await renderDetail(null), RECHECK_LABEL)).toBe('disabled')
  })

  test('既存のボタンの文言と並びは変わらず、新しいボタンは「AI で判定し直す」と「通知を再送」の間に出る', async () => {
    const markup = await renderDetail({ ...baseJob, status: 'registered', reasons: auto })
    const labels = ['対象外にする', RETRY_LABEL, REJUDGE_LABEL, RECHECK_LABEL, '通知を再送']
    const positions = labels.map((label) => markup.indexOf(label))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect(positions).toEqual(positions.slice().sort((left, right) => left - right))
    expect(buttonState(markup, LINK_LABEL)).toBe('enabled')
    expect(buttonState(markup, '対象外にする')).toBe('disabled')
    expect(buttonState(markup, RETRY_LABEL)).toBe('disabled')
  })

  test('確認ダイアログは、更新するものと変更しないものを説明し、同じ確認の仕組みで再確認を実行する', async () => {
    const detail = await Bun.file('workers/web/src/app/components/admin/webhook-job-detail.tsx').text()
    expect(detail).toContain("recheck: '判定を再確認しますか？'")
    expect(detail).toContain(
      '現在の質問とモデルで AI を再実行し、回答表・確率・プロンプトの版を更新します。登録済みのイベント、判定状態、Discord 通知は変更しません。'
    )
    expect(detail).toContain("onClick={() => setConfirmAction('recheck')}")
    expect(detail).toContain('await recheck.mutateAsync({ postId, ...candidateSelection })')
  })
})

describe('確認用の再判定のクライアント', () => {
  test('ボディなしの POST で、パスは管理 API の経路に一致し、候補はクエリで選ぶ', () => {
    const endpoint = adminEndpoints.find((entry) => entry.alias === 'recheckAdminWebhookJob')
    expect(endpoint?.method).toBe('post')
    expect(endpoint?.path).toBe('/api/admin/webhook/jobs/:postId/recheck')
    expect(endpoint?.parameters?.map((parameter) => [parameter.name, parameter.type])).toEqual([
      ['postId', 'Path'],
      ['candidateId', 'Query']
    ])
  })

  test('フックは実行関数を返し、実行前は待機中にならない', () => {
    const Probe = () => {
      const mutation = useRecheckAdminWebhookJob()
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

  test('成功時は受信履歴のクエリを無効化し、失敗は toast で知らせ、生の fetch は使わない', async () => {
    const hooks = await Bun.file('workers/web/src/app/hooks/use-admin-webhooks.ts').text()
    const start = hooks.indexOf('export const useRecheckAdminWebhookJob')
    const end = hooks.indexOf('export const useResolveAdminWebhookJob')
    const body = hooks.slice(start, end)
    expect(body).toContain('client.recheckAdminWebhookJob(')
    expect(body).toContain('queryClient.invalidateQueries({ queryKey: ADMIN_WEBHOOK_QUERY_KEY })')
    expect(body).toContain("toast.error('判定を再確認できませんでした')")
    expect(body).not.toContain('fetch(')
  })
})
