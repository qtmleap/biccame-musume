import { expect, test } from 'bun:test'
import type { WebhookDiscovery, WebhookJob } from '@biccame/shared/schemas/webhook.dto'
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NO_WEBHOOK_FILTER } from '@/atoms/webhook-filter-atom'
import { WebhookDiscoveryBadge } from '@/components/admin/webhook-discovery-badge'
import { WebhookDiscoveryPanel } from '@/components/admin/webhook-discovery-panel'
import { WebhookFilterToolbar } from '@/components/admin/webhook-filter-toolbar'
import { makeJob } from './fixtures/webhook-d1-jobs'

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

/** Link を含むパネルは、ルーターの中で描画する。 */
const renderPanel = async (job: WebhookJob) => {
  const routeTree = createRootRoute({ component: () => createElement(WebhookDiscoveryPanel, { job }) })
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  await router.load()
  return renderToStaticMarkup(createElement(RouterProvider, { router }))
}

const discovery: WebhookDiscovery = {
  relevance: 'detected',
  action: 'review',
  confidence: 0.9605,
  evidence: ['model_event_confirmed'],
  missingFields: ['conditions', 'characterIds'],
  reasons: ['distribution_condition_unspecified']
}

test('検出済みと登録保留を別に表示し、未記載条件や対象を補完しない', () => {
  const markup = renderToStaticMarkup(
    createElement(WebhookDiscoveryPanel, {
      job: { ...makeJob(), status: 'held', candidate: null, discovery, relatedEvents: null }
    })
  )
  expect(markup).toContain('検出済み')
  expect(markup).toContain('保留')
  expect(markup).toContain('入手条件、対象ビッカメ娘')
  expect(markup).toContain('AIがイベントと判定（しきい値以上）')
  expect(markup).not.toContain('誰でも')
})

test('検出の記録が無いジョブでは、保存回答があってもパネルを描画しない', () => {
  const stored = {
    ...makeJob(),
    status: 'held',
    candidate: null,
    answers: { is_event: { type: 'noul', noul: 0.96 } }
  } as const
  for (const discovery of [undefined, null]) {
    const markup = renderToStaticMarkup(createElement(WebhookDiscoveryPanel, { job: { ...stored, discovery } }))
    expect(markup).toBe('')
    expect(markup).not.toContain('検出の記録なし')
    expect(markup).not.toContain('旧履歴')
    expect(markup).not.toContain('検出と登録可否')
  }
})

test('検出の記録が無くても、元告知に対応する登録済みイベントだけは描画する', async () => {
  const job: WebhookJob = { ...makeJob(), status: 'held', candidate: null, discovery: null, relatedEvents }
  for (const discovery of [undefined, null]) {
    const markup = await renderPanel({ ...job, discovery })
    expect(markup).toContain(RELATED_HEADING)
    expect(markup).toContain('元告知の登録済みイベント')
    expect(markup).toContain('href="/admin/events/550e8400-e29b-41d4-a716-446655440000/edit"')
    expect(markup).not.toContain('検出と登録可否')
    expect(markup).not.toContain('検出の記録なし')
    expect(markup).not.toContain('旧履歴')
    expect(markup).not.toContain('登録処理')
    expect(markup).not.toContain('<section')
    expect(markup).not.toContain('<dl')
  }
  // 参照先が空なら何も描画しない。
  expect(await renderPanel({ ...job, relatedEvents: { ...relatedEvents, events: [] } })).toBe('')
  expect(await renderPanel({ ...job, relatedEvents: null })).toBe('')
})

test('検出の記録があるときは、元告知に対応する登録済みイベントを一度だけパネルの末尾に出す', async () => {
  const markup = await renderPanel({ ...makeJob(), status: 'held', candidate: null, discovery, relatedEvents })
  expect(markup.split(RELATED_HEADING)).toHaveLength(2)
  expect(markup).toContain('検出と登録可否')
  expect(markup).toContain('<div class="mt-4"><h3')
  expect(markup.indexOf(RELATED_HEADING)).toBeGreaterThan(markup.indexOf('</dl>'))
})

test('AI未実施の明示根拠を0%で表示せず、更新actionと確率不明を分離する', () => {
  const markup = renderToStaticMarkup(
    createElement(WebhookDiscoveryPanel, {
      job: {
        ...makeJob(),
        status: 'held',
        candidate: null,
        discovery: { ...discovery, action: 'update', confidence: null }
      }
    })
  )
  expect(markup).toContain('既存イベントの更新情報')
  expect(markup).toContain('AIイベント判定の確信度')
  expect(markup).not.toContain('0.0%')
})

test('一覧の省幅バッジも検出済みと登録処理を読み上げ説明で区別する', () => {
  const markup = renderToStaticMarkup(
    createElement(WebhookDiscoveryBadge, { job: { status: 'held', discovery }, compact: true })
  )
  expect(markup).toContain('検出済み')
  expect(markup).toContain('登録処理：保留')
  expect(markup).toContain('sr-only')
  const legacy = renderToStaticMarkup(createElement(WebhookDiscoveryBadge, { job: { status: 'held' }, compact: true }))
  expect(legacy).toContain('保留')
  expect(legacy).not.toContain('検出済み')
})

test('Webhook受信履歴の画面文言に独自訳の「発見」と「原確率」を使わない', () => {
  const evidence = [
    'canonical_official_account',
    'named_character_object',
    'explicit_own_object',
    'official_card_distribution',
    'character_display_operation',
    'explicit_character_anniversary_event',
    'explicit_event_operation',
    'model_event_confirmed'
  ]
  const full: WebhookDiscovery = {
    ...discovery,
    evidence,
    missingFields: ['event', 'status', 'characterIds'],
    reasons: ['not_distribution_event']
  }
  const panel = renderToStaticMarkup(
    createElement(WebhookDiscoveryPanel, { job: { ...makeJob(), status: 'held', candidate: null, discovery: full } })
  )
  const badges = (['detected', 'uncertain', 'not_detected'] as const).flatMap((relevance) =>
    [false, true].map((compact) =>
      renderToStaticMarkup(
        createElement(WebhookDiscoveryBadge, {
          job: { status: 'held', discovery: { ...discovery, relevance } },
          compact
        })
      )
    )
  )
  // 絞り込みの選択肢ラベル（閉じた Select には出ない）も、現在値として描画して確かめる。
  const toolbars = (['detected', 'uncertain', 'not_detected', 'unrecorded'] as const).map((value) =>
    renderToStaticMarkup(
      createElement(WebhookFilterToolbar, {
        characters: [],
        filter: { ...NO_WEBHOOK_FILTER, discovery: value },
        changeFilter: () => undefined
      })
    )
  )
  const markups = [panel, ...badges, ...toolbars]
  for (const markup of markups) {
    expect(markup).not.toContain('発見')
    expect(markup).not.toContain('原確率')
    expect(markup).not.toContain('関連性')
  }
  // 置き換え後の語が、パネルと絞り込みの両方で同じ呼び名になっている。
  expect(panel).toContain('検出と登録可否')
  expect(panel).toContain('検出結果')
  expect(panel).toContain('検出の根拠')
  expect(panel).toContain('AIイベント判定の確信度')
  expect(panel).toContain('ビッカメ娘のイベントか')
  expect(panel).toContain('AIのイベント判定は対象外（本文の根拠による検出判定とは別）')
  expect(toolbars[0]).toContain('aria-label="検出結果"')
  expect(toolbars[3]).toContain('検出の記録なし')
})
