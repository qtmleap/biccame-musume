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
