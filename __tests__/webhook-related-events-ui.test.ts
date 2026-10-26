import { describe, expect, test } from 'bun:test'
import type { WebhookDiscovery, WebhookJob } from '@biccame/shared/schemas/webhook.dto'
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebhookRelatedEvents } from '@/components/admin/webhook-related-events'
import { makeJob } from './fixtures/webhook-d1-jobs'
import { listJob, renderDetail } from './fixtures/webhook-management'

const relatedEvents: NonNullable<WebhookJob['relatedEvents']> = {
  basis: 'source_reference',
  events: [
    {
      eventId: '550e8400-e29b-41d4-a716-446655440000',
      title: '元告知の登録済みイベント',
      sourceUrl: 'https://example.invalid/post/1000000000000000001'
    }
  ]
}
const RELATED_HEADING = '元告知に対応する登録済みイベント'
const REMOVED_PANEL = '検出と登録可否'
const EDIT_HREF = 'href="/admin/events/550e8400-e29b-41d4-a716-446655440000/edit"'

const discovery: WebhookDiscovery = {
  relevance: 'detected',
  action: 'review',
  confidence: 0.9605,
  evidence: ['model_event_confirmed'],
  missingFields: ['conditions', 'characterIds'],
  reasons: ['distribution_condition_unspecified']
}

const relatedHeadings = (markup: string) =>
  [...markup.matchAll(/<h2\b[^>]*>(.*?)<\/h2>/g)].filter((match) => match[1] === RELATED_HEADING)

/** Link を含むので、ルーターの中で描画する。 */
const renderRelated = async (job: WebhookJob) => {
  const routeTree = createRootRoute({ component: () => createElement(WebhookRelatedEvents, { job }) })
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  await router.load()
  return renderToStaticMarkup(createElement(RouterProvider, { router }))
}

describe('元告知に対応する登録済みイベント（単独のコンポーネント）', () => {
  const job: WebhookJob = { ...makeJob(), status: 'held', candidate: null, discovery: null, relatedEvents }

  test('検出の記録があってもなくても、参照先があれば見出し・説明・編集ページへのリンクを一度だけ描画する', async () => {
    for (const recorded of [undefined, null, discovery]) {
      const markup = await renderRelated({ ...job, discovery: recorded })
      expect(relatedHeadings(markup)).toHaveLength(1)
      expect(markup).toContain('aria-label="元告知に対応する登録済みイベント"')
      expect(markup).toContain('イベント本体は自動更新しません')
      expect(markup).toContain('元告知の登録済みイベント')
      expect(markup).toContain(EDIT_HREF)
      expect(markup).not.toContain(REMOVED_PANEL)
      expect(markup).not.toContain('<dl')
    }
  })

  test('参照先が無い・空なら、検出の記録があっても何も描画しない', async () => {
    for (const recorded of [undefined, null, discovery]) {
      expect(await renderRelated({ ...job, discovery: recorded, relatedEvents: null })).toBe('')
      expect(await renderRelated({ ...job, discovery: recorded, relatedEvents: undefined })).toBe('')
      expect(
        await renderRelated({ ...job, discovery: recorded, relatedEvents: { ...relatedEvents, events: [] } })
      ).toBe('')
    }
  })
})

describe('詳細ページの関連イベントと「検出と登録可否」の撤去', () => {
  test('検出の記録がある履歴でも「検出と登録可否」の節を出さず、関連イベントは出す', async () => {
    const markup = await renderDetail({ ...listJob, discovery, relatedEvents })
    expect(markup).not.toContain('aria-label="検出と登録可否"')
    expect(markup).not.toContain(REMOVED_PANEL)
    expect(relatedHeadings(markup)).toHaveLength(1)
    expect(markup).toContain(EDIT_HREF)
    const headings = [...markup.matchAll(/<h2\b[^>]*>(.*?)<\/h2>/g)].map((match) => match[1])
    expect(headings.slice(0, 4)).toEqual([RELATED_HEADING, '元投稿', 'Clef の回答', '判定・イベント登録'])
  })

  test('検出の記録が無い古い履歴でも、関連イベントだけが出る', async () => {
    for (const recorded of [undefined, null]) {
      const markup = await renderDetail({ ...listJob, discovery: recorded, relatedEvents })
      expect(markup).not.toContain('aria-label="検出と登録可否"')
      expect(markup).not.toContain(REMOVED_PANEL)
      expect(relatedHeadings(markup)).toHaveLength(1)
      expect(markup).toContain(EDIT_HREF)
    }
  })

  test('関連イベントが無いときは、検出の記録の有無にかかわらず何も出さない', async () => {
    for (const recorded of [undefined, null, discovery]) {
      for (const related of [undefined, null, { ...relatedEvents, events: [] }]) {
        const markup = await renderDetail({ ...listJob, discovery: recorded, relatedEvents: related })
        expect(markup).not.toContain(RELATED_HEADING)
        expect(markup).not.toContain('aria-label="検出と登録可否"')
        expect(markup).not.toContain(REMOVED_PANEL)
        const headings = [...markup.matchAll(/<h2\b[^>]*>(.*?)<\/h2>/g)].map((match) => match[1])
        expect(headings.slice(0, 3)).toEqual(['元投稿', 'Clef の回答', '判定・イベント登録'])
      }
    }
  })
})
