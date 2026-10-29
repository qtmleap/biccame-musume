import { describe, expect, test } from 'bun:test'
import type { WebhookCandidate, WebhookDiscovery } from '@biccame/shared/schemas/webhook.dto'
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebhookCandidateList } from '@/components/admin/webhook-candidate-list'
import {
  baseJob,
  candidateOf,
  eventOf,
  firstUuid,
  identifiedSection,
  renderDetail,
  secondUuid
} from './fixtures/webhook-detail-link'

const discoveryOf = (relevance: WebhookDiscovery['relevance']): WebhookDiscovery => ({
  relevance,
  action: 'review',
  confidence: 0.96,
  evidence: ['model_event_confirmed'],
  missingFields: [],
  reasons: []
})

/** 候補リストの行は Link を含むので、ルーターの中で描画する。 */
const renderList = async (candidates: readonly WebhookCandidate[]) => {
  const routeTree = createRootRoute({
    component: () =>
      createElement(WebhookCandidateList, {
        candidates,
        activeId: undefined,
        isPending: false,
        onSelect: () => undefined
      })
  })
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  await router.load()
  return renderToStaticMarkup(createElement(RouterProvider, { router }))
}

/** 行のバッジの表示文言(sr-only や title ではなく、見えるラベル)を並び順のまま取り出す。 */
const badgeLabels = (markup: string): string[] =>
  [...markup.matchAll(/<span\b[^>]*data-slot="badge"[^>]*>(.*?)<\/span>/g)].map((match) =>
    match[1].replace(/<svg\b.*?<\/svg>/g, '').replace(/<[^>]+>/g, '')
  )

const registered = { status: 'registered', eventId: secondUuid, eventTitle: '登録された名刺' } as const

describe('識別されたイベントの行のバッジ', () => {
  test('登録済み＋検出済みは「登録済み」だけを出し、「検出済み」は出さない', async () => {
    const markup = await renderList([
      candidateOf('名刺', firstUuid, { ...registered, discovery: discoveryOf('detected') })
    ])
    expect(badgeLabels(markup)).toEqual(['登録済み'])
    expect(markup).not.toContain('検出済み')
  })

  test('保留＋検出済みは「保留」だけを出し、「検出済み」は出さない', async () => {
    const markup = await renderList([
      candidateOf('名刺', firstUuid, { status: 'held', discovery: discoveryOf('detected') })
    ])
    expect(badgeLabels(markup)).toEqual(['保留'])
    expect(markup).not.toContain('検出済み')
  })

  test('保留＋対象外は「対象外」を左に、状態の「保留」を右端に出す', async () => {
    const markup = await renderList([
      candidateOf('名刺', firstUuid, { status: 'held', discovery: discoveryOf('not_detected') })
    ])
    expect(badgeLabels(markup)).toEqual(['対象外', '保留'])
    expect(markup).not.toContain('検出済み')
  })

  test('保留＋判定未確定は「判定未確定」を左に、状態の「保留」を右端に出す', async () => {
    const markup = await renderList([
      candidateOf('名刺', firstUuid, { status: 'held', discovery: discoveryOf('uncertain') })
    ])
    expect(badgeLabels(markup)).toEqual(['判定未確定', '保留'])
    expect(markup).not.toContain('検出済み')
  })

  test('検出の記録が無い旧履歴は、状態バッジをちょうど1つだけ出す（二重に出さない）', async () => {
    for (const discovery of [undefined, null]) {
      for (const status of ['held', 'registered'] as const) {
        const markup = await renderList([
          candidateOf('名刺', firstUuid, { status, ...(status === 'registered' ? registered : {}), discovery })
        ])
        expect(badgeLabels(markup), `${status}/${String(discovery)}`).toEqual([status === 'held' ? '保留' : '登録済み'])
        expect(markup.match(/data-slot="badge"/g)).toHaveLength(1)
      }
    }
  })

  test('登録イベントのリンクは eventId があるときだけ、イベント詳細へ向けて出す', async () => {
    const withEvent = await renderList([
      candidateOf('名刺', firstUuid, { ...registered, discovery: discoveryOf('detected') })
    ])
    expect(withEvent).toContain(`href="/events/${secondUuid}"`)
    expect(withEvent).toContain('>登録イベント</a>')
    const without = await renderList([
      candidateOf('名刺', firstUuid, { status: 'held', eventId: null, discovery: discoveryOf('detected') })
    ])
    expect(without).not.toContain('登録イベント')
  })

  test('登録済みの行は、右のグループの最後が状態バッジで、登録イベントのリンクはその前に出る', async () => {
    const markup = await renderList([
      candidateOf('名刺', firstUuid, { ...registered, discovery: discoveryOf('uncertain') })
    ])
    const row = markup.match(/<li\b[^>]*>.*?<\/li>/)?.[0]
    if (row === undefined) throw new Error('行が描画されていない')
    // 右のグループ（ml-auto）は行の直下の最後の子で、閉じタグ手前の最後の要素が状態バッジになる。
    const groupStart = row.indexOf('<div class="ml-auto')
    expect(groupStart).toBeGreaterThan(0)
    const group = row.slice(groupStart)
    const link = group.indexOf('>登録イベント</a>')
    const discovery = group.indexOf('判定未確定')
    const status = group.lastIndexOf('data-slot="badge"')
    expect(link).toBeGreaterThan(0)
    expect(link).toBeLessThan(discovery)
    expect(discovery).toBeLessThan(status)
    expect(badgeLabels(group).at(-1)).toBe('登録済み')
    expect(group.trimEnd().endsWith('</span></div></li>')).toBe(true)
    // 候補名のボタンは右のグループの外（左）にある。
    expect(row.indexOf('<button')).toBeLessThan(groupStart)
  })

  test('複数の候補は、行ごとに自分の状態と検出結果のバッジを持つ', async () => {
    const markup = await renderList([
      candidateOf('名刺', firstUuid, { ...registered, discovery: discoveryOf('detected') }),
      candidateOf('アクキー', secondUuid, { status: 'held', discovery: discoveryOf('uncertain') })
    ])
    const rows = [...markup.matchAll(/<li\b[^>]*>.*?<\/li>/g)].map((match) => badgeLabels(match[0]))
    expect(rows).toEqual([['登録済み'], ['判定未確定', '保留']])
  })

  test('詳細ページでも同じ（識別されたイベントの節に「検出済み」を出さず、登録の状態を出す）', async () => {
    const section = identifiedSection(
      await renderDetail({
        ...baseJob,
        candidates: [
          candidateOf('名刺', firstUuid, {
            ...registered,
            candidate: eventOf('登録された名刺', firstUuid),
            discovery: discoveryOf('detected')
          }),
          candidateOf('アクキー', secondUuid, { status: 'held', discovery: discoveryOf('not_detected') })
        ]
      })
    )
    if (section === undefined) throw new Error('識別されたイベントの節が描画されていない')
    expect(badgeLabels(section)).toEqual(['登録済み', '対象外', '保留'])
    expect(section).not.toContain('検出済み')
    expect(section).toContain(`href="/events/${secondUuid}"`)
  })
})
