import { describe, expect, test } from 'bun:test'
import type { ClefAnswer } from '@biccame/shared/event-detect/clef'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebhookAnswerTable } from '@/components/admin/webhook-answer-table'
import { basicCellsOf, gridRootOf } from './fixtures/webhook-answer-grid'

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

const cellsOf = (configured: boolean) => {
  const root = gridRootOf(render(configured))
  if (root === null) throw new Error('Missing grid root')
  return root.querySelectorAll('li[data-key]')
}

describe('Clef の回答 Grid の基線揃え', () => {
  test('1行目（ラベルとステータス）も2行目（回答と確率）も items-baseline の flex で、箱の中心揃えを使わない', () => {
    for (const configured of [true, false]) {
      const cells = cellsOf(configured)
      expect(cells).toHaveLength(3)
      for (const cell of cells) {
        const lines = cell.querySelectorAll(':scope > div')
        expect(lines).toHaveLength(2)
        for (const line of lines) {
          const classes = line.getAttribute('class')
          expect(classes).toContain('flex')
          expect(classes).toContain('items-baseline')
          expect(classes).not.toContain('items-center')
        }
      }
    }
  })

  test('等幅は数値の span にだけ付き、セルや行やラベル・回答の span には付かない', () => {
    for (const configured of [true, false]) {
      for (const cell of cellsOf(configured)) {
        expect(cell.getAttribute('class')).not.toContain('font-mono')
        for (const field of ['label', 'answer', 'status']) {
          const element = cell.querySelector(`[data-field="${field}"]`)
          expect(element?.getAttribute('class')).not.toContain('font-mono')
        }
        const probability = cell.querySelector('[data-field="probability"]')
        expect(probability?.getAttribute('class')).toContain('font-mono')
        expect(probability?.getAttribute('class')).toContain('tabular-nums')
        expect(probability?.getAttribute('class')).toContain('text-right')
        // 行高 0 の工夫は Grid では使わない（flex アイテムの高さが潰れるため）。
        expect(cell.outerHTML).not.toContain('leading-[0]')
      }
    }
  })

  test('補足のしきい値と次点の数値だけが等幅 span で、日本語の文字は sans のまま', () => {
    const [tentative, confirmed, withoutAlternatives] = basicCellsOf(render(true))
    expect(tentative?.note).toBe('しきい値 80.0% · 次点 開始 15.0% / 状態なし 5.0%')
    expect(confirmed?.note).toBe('しきい値 90.0% · 次点 いいえ 1.0%')
    expect(withoutAlternatives?.note).toBe('しきい値 90.0%')
    const note = gridRootOf(render(true))?.querySelector('[data-key="status"] [data-field="note"]')
    expect(note?.querySelectorAll('span').map((span) => span.getAttribute('class'))).toEqual([
      'font-mono tabular-nums',
      'font-mono tabular-nums',
      'font-mono tabular-nums'
    ])
  })

  test('確率としきい値の値は等幅 span の中に出て、現在のしきい値が無い間のしきい値は — になる', () => {
    const [, confirmed] = basicCellsOf(render(true))
    expect(confirmed?.probability).toBe('99.0%')
    expect(confirmed?.note).toContain('90.0%')
    for (const cell of basicCellsOf(render(false))) {
      expect(cell.note).toContain('しきい値 —')
      expect(cell.status).toBe('—')
    }
  })

  test('ステータスは Badge で、確定と未確定の文言を出す。現在のしきい値が無い間は出さない', () => {
    expect(basicCellsOf(render(true)).map((cell) => cell.status)).toEqual(['未確定', '確定', '未確定'])
    expect(render(true).match(/data-slot="badge"/g)).toHaveLength(3)
    expect(render(false)).not.toContain('data-slot="badge"')
  })
})
