import { describe, expect, test } from 'bun:test'
import type { ClefAnswer } from '@biccame/shared/event-detect/clef'
import { DEFAULT_DETECTION_THRESHOLDS } from '@biccame/shared/event-detect/detection'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebhookAnswerTable } from '@/components/admin/webhook-answer-table'
import { basicCellsOf, gridRootOf, groupsOfGrid, pairsOfCells } from './fixtures/webhook-answer-grid'

const answers: Record<string, ClefAnswer> = {
  'character.funato': { type: 'noul', noul: 0.99 },
  'venue.funabashi': { type: 'noul', noul: 0.98 },
  is_event: { type: 'noul', noul: 0.99 },
  'character.funabashi': { type: 'noul', noul: 0.01 },
  'venue.akiba': { type: 'noul', noul: 0.02 },
  unknown_question: { type: 'score', score: 3 }
}
const render = (values = answers, configured = true) =>
  renderToStaticMarkup(
    createElement(WebhookAnswerTable, {
      answers: values,
      ...(configured ? { thresholds: DEFAULT_DETECTION_THRESHOLDS } : {})
    })
  )
const labelsOf = (markup: string) => groupsOfGrid(markup).map((group) => group.label)
const cellLabels = (group: ReturnType<typeof groupsOfGrid>[number] | undefined) =>
  group === undefined ? [] : group.cells.map((cell) => cell.label)

describe('Clef回答の独立グループ表示', () => {
  test('保存順が混ざっていても、基本判定・開催配布店舗・対象ビッカメ娘を別のグループで表示する', () => {
    const groups = groupsOfGrid(render())
    expect(groups.map((group) => group.label)).toEqual(['基本判定', '開催・配布店舗', '対象ビッカメ娘'])
    // 回答に venue.* / character.* がある（grouped）ときは、各グループに見出しが付く。
    expect(groups.map((group) => group.heading)).toEqual(['基本判定', '開催・配布店舗', '対象ビッカメ娘'])
    // is_event は判定には使うが、回答表のセルとしては出さない（他の基本判定のセルは従来どおり出る）。
    expect(cellLabels(groups[0])).toEqual(['unknown_question'])
    expect(cellLabels(groups[1])).toEqual(['船橋駅FACE店'])
    expect(cellLabels(groups[2])).toEqual(['ふなとーたん'])
    // 検出用カタログの名前（ビックカメラ…）ではなく、アプリの短い店舗名で出す。
    expect(render()).not.toContain('ビックカメラ')
    expect(render()).not.toContain('開催店舗:')
    expect(render()).not.toContain('対象ビッカメ娘:')
    expect(render()).not.toContain('ビッカメ娘のイベントか')
  })

  test('基本判定を保ち、店舗とビッカメ娘の否定回答だけを非表示にする。各セルは5つの欄を持つ', () => {
    const markup = render()
    const cells = groupsOfGrid(markup).flatMap((group) => group.cells)
    expect(cells).toHaveLength(3)
    expect(markup).not.toContain('AKIBA店')
    expect(answers['venue.akiba']).toEqual({ type: 'noul', noul: 0.02 })
    expect(answers['character.funabashi']).toEqual({ type: 'noul', noul: 0.01 })
    const [venue, character] = groupsOfGrid(markup)
      .slice(1)
      .flatMap((group) => group.cells)
    expect(venue).toMatchObject({ answer: 'はい', probability: '98.0%', status: '確定' })
    expect(character).toMatchObject({ answer: 'はい', probability: '99.0%', status: '確定' })
    // 次点は反対の回答（いいえ）。
    expect(venue?.note).toBe('しきい値 90.0% · 次点 いいえ 2.0%')
    for (const cell of cells) {
      for (const field of [cell.label, cell.answer, cell.probability, cell.status]) expect(field).toBeDefined()
    }
  })

  test('is_event の行は画面の回答表に出さず、is_event を含まない回答のセルは従来どおり出る', () => {
    const withEvent = render(answers)
    expect(withEvent).not.toContain('ビッカメ娘のイベントか')
    const { is_event: _isEvent, ...withoutEvent } = answers
    // is_event を含まない回答だけでも、セルは同じ（is_event を含む回答からセルを足し引きしない）。
    const flat = (markup: string) => groupsOfGrid(markup).flatMap((group) => pairsOfCells(group.cells))
    expect(flat(render(withoutEvent))).toEqual(flat(withEvent))
    expect(flat(render(withoutEvent))).toHaveLength(3)
    expect(render(withoutEvent)).toContain('unknown_question')
    // 描画の入力（回答そのもの）は書き換えない。
    expect(answers.is_event).toEqual({ type: 'noul', noul: 0.99 })
  })

  test('is_event だけの回答は、セルが無いので「回答の記録なし」を出し、回答表の根を出さない', () => {
    const markup = render({ is_event: { type: 'noul', noul: 0.99 } })
    expect(markup).toContain('回答の記録なし')
    expect(gridRootOf(markup)).toBeNull()
    expect(markup).not.toContain('ビッカメ娘のイベントか')
  })

  test('店舗のみ・ビッカメ娘のみの場合は空グループを表示しない', () => {
    expect(labelsOf(render({ 'venue.funabashi': { type: 'noul', noul: 0.98 } }))).toEqual(['開催・配布店舗'])
    expect(labelsOf(render({ 'character.funato': { type: 'noul', noul: 0.99 } }))).toEqual(['対象ビッカメ娘'])
  })

  test('肯定が無いグループは該当なしと表示し、低確率の肯定は未確定で残す', () => {
    const groups = groupsOfGrid(
      render({
        'venue.akiba': { type: 'noul', noul: 0.01 },
        'character.funato': { type: 'noul', noul: 0.719 },
        'character.funabashi': { type: 'noul', noul: 0.02 }
      })
    )
    expect(groups[0]).toMatchObject({ label: '開催・配布店舗', empty: true, cells: [] })
    expect(groups[1]?.cells).toHaveLength(1)
    expect(groups[1]?.cells[0]).toMatchObject({ label: 'ふなとーたん', probability: '71.9%', status: '未確定' })
    expect(groups[1]?.cells[0]?.className).toContain('bg-warning/10')
    expect(render({ 'character.funabashi': { type: 'noul', noul: 0.02 } })).not.toContain('ふなたん')
  })

  test('しきい値未取得でもグループを維持し、推測した確定バッジを表示しない', () => {
    const markup = render(answers, false)
    expect(groupsOfGrid(markup)).toHaveLength(3)
    expect(markup).not.toContain('data-slot="badge"')
    expect(markup).not.toContain('bg-warning/10')
    for (const cell of groupsOfGrid(markup).flatMap((group) => group.cells)) {
      expect(cell.status).toBe('—')
      expect(cell.note).toContain('しきい値 —')
    }
  })

  test('旧版の回答は質問を増やさず従来の表示を保つ（見出しは出さない）', () => {
    const markup = render({
      store: { type: 'choice', choice: 'none', probabilities: { none: 0.99 } },
      is_event: { type: 'noul', noul: 0.99 }
    })
    expect(labelsOf(markup)).toEqual(['基本判定'])
    expect(groupsOfGrid(markup)[0]?.heading).toBeUndefined()
    expect(markup).not.toContain('<h3')
    expect(markup).toContain('店舗なし')
    expect(markup).not.toContain('対象ビッカメ娘:')
  })
})

describe('グループ見出しとグリッド', () => {
  test('回答表は aria-label の付いた ul で、table のロールとタグを使わない', () => {
    const markup = render()
    const root = gridRootOf(markup)
    expect(root?.tagName).toBe('UL')
    for (const tag of ['<table', '<tr', '<td', '<th', 'role="table"', 'role="row"', 'role="cell"']) {
      expect(markup).not.toContain(tag)
    }
  })

  test('各グループのセルは ul の grid に並び、列数は幅に応じた自動列', () => {
    const root = gridRootOf(render())
    if (root === null) throw new Error('Missing grid root')
    const lists = root.querySelectorAll('section > ul')
    expect(lists).toHaveLength(3)
    for (const list of lists) {
      expect(list.getAttribute('class')).toContain('grid')
      expect(list.getAttribute('class')).toContain('md:grid-cols-[repeat(auto-fill,minmax(17rem,1fr))]')
    }
  })

  test('基本判定の先頭グループは basicCellsOf で取り出せる', () => {
    expect(basicCellsOf(render()).map((cell) => cell.label)).toEqual(['unknown_question'])
    expect(basicCellsOf(render({}))).toEqual([])
  })
})
