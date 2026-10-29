import { describe, expect, test } from 'bun:test'
import type { WebhookCandidate, WebhookDiscovery, WebhookJob } from '@biccame/shared/schemas/webhook.dto'
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebhookLinkedEventProposal } from '@/components/admin/webhook-linked-event-proposal'
import { makeJob } from './fixtures/webhook-d1-jobs'
import { listJob, renderDetail } from './fixtures/webhook-management'

const TITLE = '連携先の提案'
const PROPOSED = '550e8400-e29b-41d4-a716-446655440077'
const OTHER = '550e8400-e29b-41d4-a716-446655440078'
const LINK_LABEL = 'このイベントと連携'
const EDIT_HREF = `href="/admin/events/${PROPOSED}/edit"`
const discovery: WebhookDiscovery = {
  relevance: 'detected',
  action: 'end',
  confidence: 0.96,
  evidence: ['model_event_confirmed'],
  missingFields: [],
  reasons: ['event_ended']
}
const proposed: WebhookDiscovery = {
  ...discovery,
  linkedEvent: { eventId: PROPOSED, title: '提案された配布イベント', probability: 0.8123 }
}
const headings = (markup: string) => [...markup.matchAll(/<h2\b[^>]*>(.*?)<\/h2>/g)].map((match) => match[1])

/** Link を含むので、ルーターの中で描画する。 */
const renderProposal = async (job: WebhookJob) => {
  const routeTree = createRootRoute({
    component: () =>
      createElement(WebhookLinkedEventProposal, { job, canLink: true, isPending: false, onLink: async () => {} })
  })
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  await router.load()
  return renderToStaticMarkup(createElement(RouterProvider, { router }))
}

describe('連携先の提案（単独のコンポーネント）', () => {
  const job: WebhookJob = { ...makeJob(), status: 'held', candidate: null }

  test('提案があれば、見出し・説明・タイトルの編集ページへのリンク・確率を一度だけ描画する', async () => {
    const markup = await renderProposal({ ...job, discovery: proposed })
    expect(headings(markup).filter((heading) => heading === TITLE)).toHaveLength(1)
    expect(markup).toContain(`aria-label="${TITLE}"`)
    expect(markup).toContain('終了または継続を知らせる投稿の連携先候補です。自動では連携しません')
    expect(markup).toContain('継続')
    expect(markup).toContain('提案された配布イベント')
    expect(markup).toContain(EDIT_HREF)
    expect(markup).toContain('81.2%')
    // 見出しは他の節（元告知に対応する登録済みイベントなど）と同じクラス。
    expect(markup).toContain('<h2 class="mb-2 text-lg font-semibold md:text-xl">')
  })

  test('継続（update）と判定された投稿の提案も、同じ節として描画する', async () => {
    const markup = await renderProposal({ ...job, discovery: { ...proposed, action: 'update' } })
    expect(headings(markup).filter((heading) => heading === TITLE)).toHaveLength(1)
    expect(markup).toContain('終了または継続を知らせる投稿の連携先候補です')
    expect(markup).toContain(EDIT_HREF)
  })

  test('提案が無ければ（旧データ・記録なし・提案なしの記録）何も描画しない', async () => {
    for (const recorded of [undefined, null, discovery])
      expect(await renderProposal({ ...job, discovery: recorded })).toBe('')
  })

  test('提案のイベントへ連携済みなら、節も「このイベントと連携」ボタンも描画しない', async () => {
    const linked: WebhookJob = { ...job, status: 'registered', eventId: PROPOSED, discovery: proposed }
    expect(await renderProposal(linked)).toBe('')
  })

  test('別のイベントへ連携済みなら提案を描画し、連携し直せる', async () => {
    const markup = await renderProposal({ ...job, status: 'registered', eventId: OTHER, discovery: proposed })
    expect(headings(markup).filter((heading) => heading === TITLE)).toHaveLength(1)
    expect(markup).toContain(EDIT_HREF)
    expect(markup).toContain(LINK_LABEL)
  })

  test('未連携（eventId が null）なら提案を描画する', async () => {
    const markup = await renderProposal({ ...job, eventId: null, discovery: proposed })
    expect(headings(markup).filter((heading) => heading === TITLE)).toHaveLength(1)
    expect(markup).toContain(LINK_LABEL)
  })
})

describe('詳細ページの連携先の提案', () => {
  const candidateOf = (index: number, recorded: WebhookDiscovery): WebhookCandidate => ({
    ...listJob,
    eventUUID: `550e8400-e29b-41d4-a716-44665544010${index}`,
    item: `配布物${index}`,
    storeKey: 'akiba',
    discovery: recorded
  })

  test('提案がある履歴では、元投稿の前に出す', async () => {
    const markup = await renderDetail({ ...listJob, discovery: proposed })
    expect(headings(markup).slice(0, 4)).toEqual([TITLE, '元投稿', 'Clef の回答', '判定・イベント登録'])
    expect(markup).toContain(EDIT_HREF)
  })

  test('提案が無い履歴では何も出さない', async () => {
    for (const recorded of [undefined, null, discovery]) {
      const markup = await renderDetail({ ...listJob, discovery: recorded })
      expect(markup).not.toContain(TITLE)
      expect(headings(markup).slice(0, 3)).toEqual(['元投稿', 'Clef の回答', '判定・イベント登録'])
    }
  })

  test('提案のイベントへ連携済みの履歴では、連携先の提案の節を出さない', async () => {
    const markup = await renderDetail({ ...listJob, status: 'registered', eventId: PROPOSED, discovery: proposed })
    expect(markup).not.toContain(TITLE)
    expect(markup).not.toContain(LINK_LABEL)
    expect(headings(markup).slice(0, 3)).toEqual(['元投稿', 'Clef の回答', '判定・イベント登録'])
  })

  test('別のイベントへ連携済みの履歴では、連携先の提案の節を出す', async () => {
    const markup = await renderDetail({ ...listJob, status: 'registered', eventId: OTHER, discovery: proposed })
    expect(headings(markup).slice(0, 4)).toEqual([TITLE, '元投稿', 'Clef の回答', '判定・イベント登録'])
    expect(markup).toContain(EDIT_HREF)
    expect(markup).toContain(LINK_LABEL)
  })

  test('複数の候補では、提案のイベントへ連携済みの候補を選んでいる間は節を出さず、未連携の候補なら出す', async () => {
    const linked: WebhookCandidate = { ...candidateOf(1, proposed), status: 'registered', eventId: PROPOSED }
    const unlinked: WebhookCandidate = { ...candidateOf(2, proposed), eventId: null }
    const first = await renderDetail({ ...listJob, candidates: [linked, unlinked] })
    expect(first).not.toContain(TITLE)
    const second = await renderDetail({ ...listJob, candidates: [unlinked, linked] })
    expect(headings(second)).toContain(TITLE)
    expect(second).toContain(EDIT_HREF)
  })

  test('複数の候補では、選択中の候補（既定は最初の検出済み）の提案だけを出す', async () => {
    const withProposal = candidateOf(1, proposed)
    const without = candidateOf(2, discovery)
    expect(await renderDetail({ ...listJob, candidates: [withProposal, without] })).toContain(EDIT_HREF)
    const other = await renderDetail({ ...listJob, candidates: [without, withProposal] })
    expect(other).not.toContain(EDIT_HREF)
    expect(other).not.toContain(TITLE)
  })
})
