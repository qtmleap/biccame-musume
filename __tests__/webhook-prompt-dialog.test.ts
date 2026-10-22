import { describe, expect, test } from 'bun:test'
import type { ClefRequest } from '@biccame/shared/event-detect/clef'
import type { WebhookPrompt, WebhookPromptDefinition } from '@biccame/shared/schemas/webhook.dto'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebhookPromptDialog, WebhookPromptRecord } from '@/components/admin/webhook-prompt-dialog'

const requests: ClefRequest[] = [
  {
    model: 'clef',
    state: '当時の投稿本文 <元のまま>\n2026年10月の配布案内',
    questions: {
      is_event: { type: 'noul', instructions: '当時のイベント判定ルール' },
      'venue.funabashi': { type: 'noul', instructions: '開催・配布店舗は船橋駅FACE店ですか？' }
    }
  },
  {
    model: 'clef-flash',
    state: '実際に2バッチ目へ送った本文',
    questions: { 'character.funato': { type: 'noul', instructions: '配布物の対象はふなとーたんですか？' } }
  }
]

const definition: WebhookPromptDefinition = {
  questionVersion: 'v2-webhook-v4',
  origin: 'git:verified-historical-definition',
  stateTemplate: '投稿本文: {{post.text}}\n投稿日時: {{post.createdAt}}',
  questions: [{ key: 'store', type: 'choice', instructions: '旧版の店舗判定', criteria: { none: '未確定' } }],
  dynamicCriteria: '日付と店舗の選択肢は、当時の投稿本文と候補辞書から作成する。'
}
const renderRecord = (
  values: ClefRequest[],
  questionVersion: string | null = 'recorded-v4',
  storedDefinition: WebhookPromptDefinition | null = null,
  source: WebhookPrompt['source'] = values.length > 0 ? 'recorded' : 'unavailable'
) =>
  renderToStaticMarkup(
    createElement(WebhookPromptRecord, { requests: values, questionVersion, source, definition: storedDefinition })
  )

describe('Clefの送信済みプロンプト表示', () => {
  test('記録されたバッチごとのモデル・本文・質問を整形表示し、現在版を再生成しない', () => {
    const markup = renderRecord(requests)
    // 未登録のIDは表示名を作らずそのまま出し、同じ文字列のID行も足さない
    expect(markup).toContain('プロンプトバージョン：recorded-v4')
    expect(markup).not.toContain('ID: ')
    expect(markup).toContain('aria-label="バッチ1"')
    expect(markup).toContain('aria-label="バッチ2"')
    expect(markup).toContain('バッチ1 · clef · 2問')
    expect(markup).toContain('バッチ2 · clef-flash · 1問')
    expect(markup).toContain('当時の投稿本文 &lt;元のまま&gt;\n2026年10月の配布案内')
    expect(markup).toContain('実際に2バッチ目へ送った本文')
    expect(markup).toContain('当時のイベント判定ルール')
    expect(markup).toContain('開催・配布店舗は船橋駅FACE店ですか？')
    expect(markup).toContain('配布物の対象はふなとーたんですか？')
    expect(markup).not.toContain('<元のまま>')
    expect([...markup.matchAll(/<pre\b/g)]).toHaveLength(4)
    expect(markup).toContain('whitespace-pre-wrap break-all')
  })

  test('実送信記録の無い旧版でもD1版定義を表示し、当時の実入力とは明確に区別する', () => {
    const markup = renderRecord([], 'v2-webhook-v4', definition, 'definition')
    expect(markup).toContain('D1に保存された当該バージョンのプロンプト定義')
    expect(markup).toContain('プロンプト定義 · v4')
    expect(markup).not.toContain('プロンプト定義 · v2-webhook-v4')
    expect(markup).toContain('プロンプトバージョン：v4</p>')
    expect(markup).toContain('ID: v2-webhook-v4')
    expect(markup).toContain(definition.origin)
    expect(markup).toContain(definition.stateTemplate)
    expect(markup).toContain('旧版の店舗判定')
    expect(markup).toContain(definition.dynamicCriteria)
    expect(markup).toContain('当時の実送信記録ではありません')
    expect(markup).not.toContain('バッチ')
    expect(markup).not.toContain('当時の投稿本文 &lt;元のまま&gt;')
  })

  test('実送信記録があれば優先表示し、版定義は別に展開できる', () => {
    const markup = renderRecord(requests, 'v2-webhook-v4', definition, 'recorded')
    expect(markup).toContain('判定時に保存された送信試行の入力')
    expect(markup).toContain('当時のイベント判定ルール')
    expect(markup).toContain('<details')
    expect(markup).toContain('このバージョンの定義を表示')
    expect(markup).toContain('旧版の店舗判定')
  })

  test('未知版で定義も実送信記録も無ければ状況を説明し、現在版を捏造しない', () => {
    const markup = renderRecord([], 'unknown-version')
    expect(markup).toContain('このバージョンの送信入力・プロンプト定義は保存されていません')
    expect(markup).toContain('プロンプトバージョン：unknown-version')
    expect(markup).not.toContain('ID: ')
    expect(markup).not.toContain('<pre')
  })

  test('登録済みの版は表示名を主表示にし、保存されているIDを小さく併記する', () => {
    const markup = renderRecord([], 'v5-webhook-v13-choice-associations')
    expect(markup).toContain('プロンプトバージョン：v13</p>')
    expect(markup).not.toContain('プロンプトバージョン：v5-webhook-v13-choice-associations')
    expect(markup).toContain(
      '<p class="break-all text-xs text-muted-foreground">ID: v5-webhook-v13-choice-associations</p>'
    )
  })

  test('版の記録だけが無い場合も、保存された実入力を表示する', () => {
    expect(renderRecord(requests, null)).toContain('プロンプトバージョン：記録なし')
    expect(renderRecord(requests, null)).not.toContain('ID: ')
    expect(renderRecord(requests, null)).toContain('当時のイベント判定ルール')
  })

  test.each([
    ['v2-webhook-v4', 'v4', '送信入力とプロンプト定義を確認 · v2-webhook-v4'],
    [
      'v5-webhook-v13-choice-associations',
      'v13',
      '送信入力とプロンプト定義を確認 · v5-webhook-v13-choice-associations'
    ],
    ['recorded-v4', 'recorded-v4', '送信入力とプロンプト定義を確認 · recorded-v4'],
    [null, '未判定', '送信入力とプロンプト定義を確認']
  ])('質問バージョン%sでも操作ボタンを隠さず、初回は記録を取得しない', (version, text, title) => {
    const markup = renderToStaticMarkup(
      createElement(WebhookPromptDialog, { postId: '2112435987582513432', questionVersion: version })
    )
    expect(markup).toContain('aria-label="Clefのプロンプトを表示"')
    // 見える文字は表示名、生のIDはtitle（ツールチップ）にだけ残す
    expect(markup).toContain(`title="${title}"`)
    expect(markup).toMatch(new RegExp(`data-state="closed">${text}<svg`))
    if (version !== null && text !== version) {
      expect(markup).not.toMatch(new RegExp(`>${version}<`))
    }
    expect(markup).toContain('justify-start')
    expect(markup).toContain('whitespace-nowrap')
    expect(markup).toContain('has-[&gt;svg]:px-0')
    expect(markup).not.toMatch(/\sdisabled=/)
    expect(markup).not.toContain('role="dialog"')
    expect(markup).not.toContain('プロンプトを取得しています')
  })

  test('候補ごとに遅延取得し、秘密ヘッダーや現在版生成経路をUIに持たない', async () => {
    const dialog = await Bun.file('workers/web/src/app/components/admin/webhook-prompt-dialog.tsx').text()
    const hook = await Bun.file('workers/web/src/app/hooks/use-admin-webhooks.ts').text()
    expect(dialog).toMatch(/\{open &&\s*\(\s*<WebhookPromptContent/)
    expect(dialog).toContain('candidateId={candidateId}')
    expect(dialog).not.toContain('createDetectionRequest')
    expect(dialog).not.toContain('Authorization')
    expect(dialog).not.toMatch(/\bfetch\(/)
    expect(hook).toContain('client.getAdminWebhookPrompt({ params: { postId }, queries: { candidateId } })')
    expect(hook).toContain("postId, 'prompt', candidateId === undefined ? null : candidateId")
    expect(hook).toContain('meta: { persist: false }')
  })
})
