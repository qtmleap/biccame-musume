import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BotSettingRow } from '@/components/admin/bot-settings-layout'

// しきい値の行の縦位置: 補足文・エラー文のある行でラベルが入力欄からずれないこと、数字がラベルと同じフォントで上に寄らないこと。
// 実ブラウザーでの測定は別（親が dev サーバーで行う）。ここではソースと描画結果のクラスを固定する。
const source = readFileSync(resolve('workers/web/src/app/components/admin/bot-management.tsx'), 'utf8')
const block = (() => {
  const start = source.indexOf('const ThresholdRow = (')
  const end = source.indexOf('/** 判定全体の3つのしきい値の行', start)
  if (start < 0 || end < 0) throw new Error('ThresholdRow not found')
  return source.slice(start, end)
})()
// コメント行を除いたコード部分（コメントに理由として書いた語を、クラスの検査に混ぜない）。
const thresholdRow = block
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n')

describe('ThresholdRow のソース', () => {
  test('行は sm 以上で上揃え（sm:items-start）、ラベルは入力欄の高さ（h-8）の中で中央揃え（sm:flex sm:h-8 sm:items-center）', () => {
    expect(thresholdRow).toContain('sm:items-start')
    expect(thresholdRow).not.toContain("className='py-2 sm:items-center'")
    expect(thresholdRow).toContain('sm:flex sm:h-8 sm:items-center')
    expect(thresholdRow).toContain('labelClassName')
  })
  test('入力欄はラベルと同じフォントにする（font-mono を持たない）。% の span もそのまま', () => {
    expect(thresholdRow).toContain('h-8 w-20 text-right text-sm tabular-nums')
    expect(thresholdRow).not.toContain('font-mono')
    expect(thresholdRow).toContain("className='text-sm text-muted-foreground'")
  })
  test('理由を日本語のコメントで書いている（補足文のある行でラベルがずれる／等幅の数字が上に寄る）', () => {
    expect(block).toContain('ラベルが')
    expect(block).toContain('等幅')
  })
})

describe('BotSettingRow の labelClassName', () => {
  // BotSettingRow は hooks を持たないので関数として呼んで要素を得る（children を props で渡す書き方を避ける）。
  const render = (labelClassName?: string) =>
    renderToStaticMarkup(
      BotSettingRow({
        label: 'ラベル',
        children: createElement('span', null, '値'),
        ...(labelClassName === undefined ? {} : { labelClassName })
      })
    )
  test('指定しなければ従来のまま（他の呼び出し元の見た目は変わらない）', () => {
    expect(render()).toContain('<dt class="text-muted-foreground">ラベル</dt>')
    expect(render()).toContain('grid items-center')
  })
  test('指定すると dt のクラスに合成される（既存のクラスは残る）', () => {
    expect(render('sm:flex sm:h-8 sm:items-center')).toContain(
      '<dt class="text-muted-foreground sm:flex sm:h-8 sm:items-center">ラベル</dt>'
    )
  })
})
