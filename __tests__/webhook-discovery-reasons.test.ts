import { expect, test } from 'bun:test'
import type { WebhookDiscovery } from '@biccame/shared/schemas/webhook.dto'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebhookDiscoveryPanel } from '@/components/admin/webhook-discovery-panel'
import { makeJob } from './fixtures/webhook-d1-jobs'

const discovery: WebhookDiscovery = {
  relevance: 'detected',
  action: 'create',
  confidence: 0.96,
  evidence: ['model_event_confirmed'],
  missingFields: [],
  reasons: []
}

/** 「判定時の登録理由」の行の中身。行が無ければ undefined。 */
const reasonRow = (reasons: string[]): string | undefined => {
  const markup = renderToStaticMarkup(
    createElement(WebhookDiscoveryPanel, {
      job: { ...makeJob(), status: 'registered', candidate: null, discovery: { ...discovery, reasons } }
    })
  )
  const match = /<dt[^>]*>判定時の登録理由<\/dt><dd[^>]*>(.*?)<\/dd>/.exec(markup)
  return match === null ? undefined : match[1]
}

test('判定時の登録理由には、店舗の補完・タイトルの作成など画面に出さない情報用のコードを出さない', () => {
  const row = reasonRow([
    'title_generated',
    'manually_linked',
    'store_inferred_from_account',
    'store_unconfirmed',
    'title_fallback'
  ])
  expect(row).toBe('手動で紐付け、開催店舗を確定できない')
})

test('補足しか無いときは、判定時の登録理由はなしと表示する', () => {
  expect(reasonRow(['title_generated', 'store_inferred_from_account'])).toBe('なし')
  expect(reasonRow([])).toBe('なし')
})

test('AI のイベント判定が対象外の説明は、これまでどおり出す', () => {
  expect(reasonRow(['not_distribution_event', 'title_fallback'])).toBe(
    'AIのイベント判定は対象外（本文の根拠による検出判定とは別）'
  )
})
