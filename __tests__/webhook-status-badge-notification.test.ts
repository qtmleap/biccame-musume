import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebhookStatusBadge } from '@/components/admin/webhook-status-badge'

const DONE_CLASSES = ['bg-status-ongoing', 'font-semibold', 'border-status-ongoing-foreground/30'] as const

const renderBadge = (props: { status: string; notification?: boolean; compact?: boolean }): string =>
  renderToStaticMarkup(createElement(WebhookStatusBadge, props))

describe('WebhookStatusBadgeの通知状態の完了表示', () => {
  test('通知済みは登録済みと同じ濃い塗り・太字・枠色・アイコンで表示する', () => {
    const sent = renderBadge({ status: 'sent', notification: true })
    const registered = renderBadge({ status: 'registered' })
    for (const className of DONE_CLASSES) {
      expect(sent).toContain(className)
      expect(registered).toContain(className)
    }
    expect(sent).toContain('<svg')
    expect(sent).toContain('lucide-circle-check')
    expect(sent).not.toContain('bg-status-ongoing/10')
    expect(sent).not.toContain('border-status-ongoing/40')
    // ラベル以外のマークアップ (class・アイコン) が一致し、見た目が同じになる
    expect(sent.replace('通知済み', '登録済み')).toBe(registered)
  })

  test('通知済みのラベルは変わらない', () => {
    expect(renderBadge({ status: 'sent', notification: true })).toContain('>通知済み</span>')
  })

  test.each([
    ['pending', '通知待ち'],
    ['skipped', '通知対象外'],
    ['failed', '通知失敗'],
    ['unknown', '送信結果不明']
  ])('通知状態%sは完了の濃い塗りにならずアイコンも付かない', (status, label) => {
    const markup = renderBadge({ status, notification: true })
    expect(markup).toContain(`>${label}</span>`)
    expect(markup).not.toContain('bg-status-ongoing')
    expect(markup).not.toContain('font-semibold')
    expect(markup).not.toContain('<svg')
  })

  test('通知モードでは登録済みの値を渡しても登録済みの配色にしない', () => {
    const markup = renderBadge({ status: 'registered', notification: true })
    expect(markup).not.toContain('bg-status-ongoing')
    expect(markup).not.toContain('font-semibold')
    expect(markup).not.toContain('<svg')
  })

  test('判定状態では通知済みの値を渡しても完了の配色にしない', () => {
    const markup = renderBadge({ status: 'sent' })
    expect(markup).not.toContain('bg-status-ongoing')
    expect(markup).not.toContain('<svg')
  })

  test('判定状態の登録済みは従来どおり濃い塗りとアイコンを持つ', () => {
    const markup = renderBadge({ status: 'registered' })
    for (const className of DONE_CLASSES) expect(markup).toContain(className)
    expect(markup).toContain('>登録済み</span>')
  })

  test('省幅の登録済みは従来どおりアイコンだけで表示し、完了の配色を保つ', () => {
    const markup = renderBadge({ status: 'registered', compact: true })
    for (const className of DONE_CLASSES) expect(markup).toContain(className)
    expect(markup).toContain('title="登録済み"')
    expect(markup).toContain('<span class="sr-only">登録済み</span>')
    expect(markup).toContain('size-6 shrink-0 justify-center p-0')
  })

  test('通知済みは省幅を指定してもアイコンだけに省略しない', () => {
    const markup = renderBadge({ status: 'sent', notification: true, compact: true })
    expect(markup).toContain('>通知済み</span>')
    expect(markup).not.toContain('sr-only')
    expect(markup).not.toContain('size-6')
  })

  test('判定状態の他の値は見た目を変えない', () => {
    expect(renderBadge({ status: 'held' })).toContain('border-warning/40 bg-warning/10 text-foreground')
    expect(renderBadge({ status: 'failed' })).toContain('border-destructive/40 bg-destructive/10 text-destructive')
    expect(renderBadge({ status: 'ignored' })).not.toContain('bg-status-ongoing')
    expect(renderBadge({ status: 'queued' })).not.toContain('bg-status-ongoing')
  })
})
