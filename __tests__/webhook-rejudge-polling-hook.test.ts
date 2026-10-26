import { afterEach, describe, expect, setSystemTime, test } from 'bun:test'
import type { WebhookJob } from '@biccame/shared/schemas/webhook.dto'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ADMIN_WEBHOOK_QUERY_KEY, useAdminWebhookJob } from '@/hooks/use-admin-webhooks'
import {
  answers,
  baseJob,
  buttonState,
  JUDGING_NOTICE,
  LINK_LABEL,
  postId,
  REJUDGE_LABEL,
  renderDetail
} from './fixtures/webhook-rejudge'

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

  test('判定待ちでも連携の可否は変えない（連携は押せないまま）。「再実行」は押せて、理由は確認ダイアログに出る', async () => {
    const markup = await renderDetail({ ...baseJob, status: 'queued', notificationStatus: 'pending' })
    expect(buttonState(markup, REJUDGE_LABEL)).toBe('enabled')
    expect(buttonState(markup, LINK_LABEL)).toBe('disabled')
  })
})
