import { describe, expect, test } from 'bun:test'
import type { WebhookDiscovery, WebhookJob } from '@biccame/shared/schemas/webhook.dto'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebhookEventLinkBody } from '@/components/admin/webhook-event-link-dialog'
import { initialWebhookLinkStage, LINK_ASK_TITLE } from '@/components/admin/webhook-event-link-stage'
import { activeLinkedEventProposal, isEndedPost } from '@/components/admin/webhook-linked-event-confirm'
import { Dialog } from '@/components/ui/dialog'
import { makeJob } from './fixtures/webhook-d1-jobs'

const PROPOSED = '550e8400-e29b-41d4-a716-446655440077'
const OTHER = '550e8400-e29b-41d4-a716-446655440078'
const linkedEvent = { eventId: PROPOSED, title: '提案された配布イベント', probability: 0.8123 }
const base: WebhookDiscovery = {
  relevance: 'detected',
  action: 'update',
  confidence: 0.96,
  evidence: [],
  missingFields: [],
  reasons: ['event_continued']
}
const proposed: WebhookDiscovery = { ...base, linkedEvent }
const jobOf = (discovery: WebhookJob['discovery'], eventId: string | null): WebhookJob => ({
  ...makeJob(),
  discovery,
  eventId
})

describe('activeLinkedEventProposal（表示すべき連携先の提案）', () => {
  test('提案が無ければ undefined（discovery が undefined・null・提案なしの記録）', () => {
    for (const discovery of [undefined, null, base]) {
      expect(activeLinkedEventProposal(jobOf(discovery, null))).toBeUndefined()
      expect(activeLinkedEventProposal(jobOf(discovery, PROPOSED))).toBeUndefined()
    }
  })

  test('提案があり、まだ連携していなければ（eventId が null）提案を返す', () => {
    expect(activeLinkedEventProposal(jobOf(proposed, null))).toEqual(linkedEvent)
  })

  test('提案のイベントへ連携済みなら undefined（同じイベントを聞き直さない）', () => {
    expect(activeLinkedEventProposal(jobOf(proposed, PROPOSED))).toBeUndefined()
  })

  test('別のイベントへ連携済みなら提案を返す（連携し直せる）', () => {
    expect(activeLinkedEventProposal(jobOf(proposed, OTHER))).toEqual(linkedEvent)
  })

  test('受信ジョブ全体でなく、discovery と eventId だけを見る', () => {
    expect(activeLinkedEventProposal({ discovery: proposed, eventId: null })).toEqual(linkedEvent)
    expect(activeLinkedEventProposal({ discovery: proposed, eventId: PROPOSED })).toBeUndefined()
  })
})

describe('上部「連携」ボタンのダイアログに渡す提案', () => {
  /** 詳細ページが suggestion として渡す値で、ダイアログの中身(段階)を静的に描画する。 */
  const renderDialogFor = (job: WebhookJob) => {
    const suggestion = activeLinkedEventProposal(job)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['admin-events'], [])
    try {
      return renderToStaticMarkup(
        createElement(
          QueryClientProvider,
          { client },
          createElement(
            Dialog,
            { open: true },
            createElement(WebhookEventLinkBody, {
              ...(suggestion === undefined ? {} : { suggestion }),
              disabled: false,
              isPending: false,
              replacing: job.status === 'registered',
              ended: isEndedPost(job),
              scope: { stores: [], postedAt: '2026-10-02T03:00:00.000Z' },
              onLink: async () => {},
              onClose: () => {}
            })
          )
        )
      )
    } finally {
      client.clear()
    }
  }

  test('提案のイベントへ連携済みなら、確認の段階ではなく検索の段階から開く', () => {
    const job: WebhookJob = { ...jobOf(proposed, PROPOSED), status: 'registered' }
    expect(initialWebhookLinkStage(activeLinkedEventProposal(job))).toBe('search')
    const markup = renderDialogFor(job)
    expect(markup).not.toContain(LINK_ASK_TITLE)
    expect(markup).toContain('既存イベントへ連携')
    expect(markup).toContain('イベントを検索')
  })

  test('未連携なら確認の段階から開く', () => {
    const job: WebhookJob = { ...jobOf(proposed, null), status: 'held' }
    expect(initialWebhookLinkStage(activeLinkedEventProposal(job))).toBe('confirm')
    const markup = renderDialogFor(job)
    expect(markup).toContain(LINK_ASK_TITLE)
    expect(markup).not.toContain('イベントを検索')
  })

  test('別のイベントへ連携済みなら確認の段階から開き、置き換える旨を続ける', () => {
    const job: WebhookJob = { ...jobOf(proposed, OTHER), status: 'registered' }
    expect(initialWebhookLinkStage(activeLinkedEventProposal(job))).toBe('confirm')
    const markup = renderDialogFor(job)
    expect(markup).toContain(LINK_ASK_TITLE)
    expect(markup).toContain('登録済みのため、現在の連携先を置き換えます')
  })

  test('詳細ページと提案の節は、判定を activeLinkedEventProposal に一本化し、discovery.linkedEvent を直接読まない', async () => {
    const dir = 'workers/web/src/app/components/admin'
    for (const file of ['webhook-job-detail.tsx', 'webhook-linked-event-proposal.tsx']) {
      const source = await Bun.file(`${dir}/${file}`).text()
      expect(source).toContain('activeLinkedEventProposal(job)')
      expect(source).not.toContain('.linkedEvent')
    }
    const detail = await Bun.file(`${dir}/webhook-job-detail.tsx`).text()
    expect(detail).toContain('const suggestedLink = proposal === undefined ? {} : { suggestion: proposal }')
    expect(detail).toContain('{...suggestedLink}')
  })
})
