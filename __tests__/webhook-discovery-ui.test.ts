import { expect, test } from 'bun:test'
import type { WebhookDiscovery } from '@biccame/shared/schemas/webhook.dto'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NO_WEBHOOK_FILTER } from '@/atoms/webhook-filter-atom'
import { WebhookDiscoveryBadge } from '@/components/admin/webhook-discovery-badge'
import { WebhookFilterToolbar } from '@/components/admin/webhook-filter-toolbar'

const discovery: WebhookDiscovery = {
  relevance: 'detected',
  action: 'review',
  confidence: 0.9605,
  evidence: ['model_event_confirmed'],
  missingFields: ['conditions', 'characterIds'],
  reasons: ['distribution_condition_unspecified']
}

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

test('省幅バッジは、登録済みなら AI の記録が判定未確定・対象外のままでも状態の「登録済み」だけを出す', () => {
  for (const relevance of ['uncertain', 'not_detected', 'detected'] as const) {
    const markup = renderToStaticMarkup(
      createElement(WebhookDiscoveryBadge, {
        job: { status: 'registered', discovery: { ...discovery, relevance } },
        compact: true
      })
    )
    expect(markup, relevance).toContain('登録済み')
    expect(markup, relevance).not.toContain('判定未確定')
    expect(markup, relevance).not.toContain('対象外')
    expect(markup, relevance).not.toContain('検出済み')
  }
  // 記録が無いときの登録済みと同じ描画になる。
  const legacy = renderToStaticMarkup(
    createElement(WebhookDiscoveryBadge, { job: { status: 'registered' }, compact: true })
  )
  const uncertain = renderToStaticMarkup(
    createElement(WebhookDiscoveryBadge, {
      job: { status: 'registered', discovery: { ...discovery, relevance: 'uncertain' } },
      compact: true
    })
  )
  expect(uncertain).toBe(legacy)
  // 保留中で判定未確定のときは、従来どおり「判定未確定」と登録処理を出す。
  const held = renderToStaticMarkup(
    createElement(WebhookDiscoveryBadge, {
      job: { status: 'held', discovery: { ...discovery, relevance: 'uncertain' } },
      compact: true
    })
  )
  expect(held).toContain('判定未確定')
  expect(held).toContain('登録処理：保留')
})

test('Webhook受信履歴の画面文言に独自訳の「発見」と「原確率」を使わない', () => {
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
  const markups = [...badges, ...toolbars]
  for (const markup of markups) {
    expect(markup).not.toContain('発見')
    expect(markup).not.toContain('原確率')
    expect(markup).not.toContain('関連性')
  }
  // 置き換え後の語が、絞り込みの呼び名になっている。
  expect(toolbars[0]).toContain('aria-label="検出結果"')
  expect(toolbars[3]).toContain('検出の記録なし')
})
