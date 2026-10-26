import { describe, expect, test } from 'bun:test'
import type { ClefAnswer } from '@biccame/shared/event-detect/clef'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebhookAnswerTable } from '@/components/admin/webhook-answer-table'

const thresholds = { eventThreshold: 0.9, fieldThreshold: 0.9, ignoreThreshold: 0.5 }

// 未確定で次点が2件ある行（status）、確定する行（single_event 99%）、次点が無い行（score）を混ぜる。
// is_event は回答表に行を出さないので、確定する行には single_event を使う。行は固定の順（status、single_event、未知のキー）で並ぶ。
const answers: Record<string, ClefAnswer> = {
  is_event: { type: 'noul', noul: 0.99 },
  status: { type: 'choice', choice: 'announce', probabilities: { announce: 0.7499, start: 0.15, none: 0.05 } },
  single_event: { type: 'noul', noul: 0.99 },
  unknown_question: { type: 'score', score: 3 }
}

const render = (configured: boolean) =>
  renderToStaticMarkup(createElement(WebhookAnswerTable, { answers, ...(configured ? { thresholds } : {}) }))

// 行ごとに td の属性と中身を取り出す。td の中に td は入らないため、最短一致で切り出せる。
const rowsOf = (markup: string) =>
  [...markup.matchAll(/<tr\b[^>]*>(?:(?!<\/tr>).)*?<td\b.*?<\/tr>/g)].map((row) =>
    [...row[0].matchAll(/<td\b([^>]*)>(.*?)<\/td>/g)].map((cell) => ({ attributes: cell[1], content: cell[2] }))
  )

const MONO_SPAN = /^<span class="font-mono tabular-nums leading-\[0\]">[^<]+<\/span>$/

describe('Clef の回答表の基線揃え', () => {
  test('確率としきい値は flex にせず、行高 0 の等幅 span を行内に置いてセルの右端に揃える', () => {
    for (const configured of [true, false]) {
      const rows = rowsOf(render(configured))
      expect(rows).toHaveLength(3)
      for (const cells of rows) {
        expect(cells).toHaveLength(6)
        for (const index of [2, 3]) {
          const cell = cells[index]
          expect(cell?.attributes).toContain('text-right')
          expect(cell?.attributes).not.toContain('font-mono')
          expect(cell?.content).not.toContain('flex')
          expect(cell?.content).not.toContain('items-center')
          expect(cell?.content).not.toContain('justify-end')
          expect(cell?.content).toMatch(MONO_SPAN)
        }
      }
    }
  })

  test('確率としきい値の値は等幅 span の中に出て、しきい値が無い間のしきい値は — になる', () => {
    const [, confirmed] = rowsOf(render(true))
    expect(confirmed?.[2]?.content).toBe('<span class="font-mono tabular-nums leading-[0]">99.0%</span>')
    expect(confirmed?.[3]?.content).toBe('<span class="font-mono tabular-nums leading-[0]">90.0%</span>')
    for (const cells of rowsOf(render(false))) {
      expect(cells[3]?.content).toBe('<span class="font-mono tabular-nums leading-[0]">—</span>')
      expect(cells[3]?.attributes).toContain('text-muted-foreground')
    }
  })

  test('次点は基線揃えの flex で並べ、箱の中心揃え（items-center）を使わない', () => {
    const rows = rowsOf(render(true))
    const [tentative, confirmed, withoutAlternatives] = rows.map((cells) => cells[5]?.content)
    // 次点が2件ある行は、gap-4 の flex の中に等幅 span が2つ並ぶ。
    expect(tentative).toBe(
      '<div class="flex items-baseline gap-4">' +
        '<span class="font-mono tabular-nums leading-[0] flex items-baseline gap-1"><span class="font-sans leading-5">開始</span> 15.0%</span>' +
        '<span class="font-mono tabular-nums leading-[0] flex items-baseline gap-1"><span class="font-sans leading-5">状態なし</span> 5.0%</span>' +
        '</div>'
    )
    expect(confirmed).toBe(
      '<div class="flex items-baseline gap-4"><span class="font-mono tabular-nums leading-[0] flex items-baseline gap-1"><span class="font-sans leading-5">いいえ</span> 1.0%</span></div>'
    )
    for (const content of [confirmed, tentative]) {
      expect(content).toContain('items-baseline')
      expect(content).not.toContain('items-center')
    }
    expect(withoutAlternatives).toBe('—')
  })

  test('判定のバッジは従来どおり flex items-center で行の中央に揃え、確定と未確定の文言を出す', () => {
    const rows = rowsOf(render(true))
    expect(rows.map((cells) => cells[4]?.content.match(/data-slot="badge"[^>]*>(.*?)<\/span>/)?.[1])).toEqual([
      '未確定',
      '確定',
      '未確定'
    ])
    for (const cells of rows) {
      expect(cells[4]?.content).toMatch(/^<div class="flex items-center"><span data-slot="badge"/)
    }
    // しきい値が無い間は判定を出さない。
    for (const cells of rowsOf(render(false))) {
      expect(cells[4]?.content).toBe('—')
    }
  })
})
