import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BotSettingRow } from '@/components/admin/bot-settings-layout'
import { WebhookPromptDialog } from '@/components/admin/webhook-prompt-dialog'

test('プロンプトバージョンはラベルと操作ボタンを上下中央に揃える', () => {
  const markup = renderToStaticMarkup(
    BotSettingRow({
      label: 'プロンプトバージョン',
      children: createElement(WebhookPromptDialog, { postId: '2112435987582513432', questionVersion: 'v2-webhook-v4' })
    })
  )
  expect(markup).toContain('grid items-center')
  expect(markup).toContain('<dt class="text-muted-foreground">プロンプトバージョン</dt>')
  // ボタンが行の高さを広げないよう、既定の py-2 と min-h-8 が残っていないことを確認する
  expect(markup).toContain('flex h-auto min-h-0 w-fit items-center justify-start px-0 py-0')
  expect(markup).not.toContain('min-h-8')
  expect(markup).not.toContain('py-2')
  expect(markup).toContain('aria-label="Clefのプロンプトを表示"')
  // 見える文字は短い表示名、生のIDはtitleにだけ残る。折り返さないので行の高さも変わらない
  expect(markup).toMatch(/data-state="closed">v4 基本の質問<svg/)
  expect(markup).toContain('title="送信入力とプロンプト定義を確認 · v2-webhook-v4"')
  expect(markup).not.toMatch(/>v2-webhook-v4</)
  expect(markup).toContain('whitespace-nowrap')
})
