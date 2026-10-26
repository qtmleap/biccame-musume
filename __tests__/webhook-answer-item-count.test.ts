import { describe, expect, test } from 'bun:test'
import type { ClefAnswer } from '@biccame/shared/event-detect/clef'
import { DEFAULT_DETECTION_THRESHOLDS } from '@biccame/shared/event-detect/detection'
import { type ItemCountAudit, ItemCountAuditSchema } from '@biccame/shared/event-detect/extraction'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebhookAnswerTable } from '@/components/admin/webhook-answer-table'
import { basicCellsOf, gridRootOf, groupsOfGrid } from './fixtures/webhook-answer-grid'
import { listJob, renderDetail } from './fixtures/webhook-management'

const auditOf = (overrides: Partial<ItemCountAudit>): ItemCountAudit => {
  const parsed = ItemCountAuditSchema.safeParse({
    version: 'distribution-items-v2',
    expected: 2,
    probability: 0.95,
    threshold: 0.7,
    extracted: 2,
    candidates: 2,
    status: 'matched',
    ...overrides
  })
  if (!parsed.success) throw new Error('Invalid item count audit fixture')
  return parsed.data
}

const answers: Record<string, ClefAnswer> = {
  is_event: { type: 'noul', noul: 0.99 },
  status: { type: 'choice', choice: 'announce', probabilities: { announce: 0.95, start: 0.03 } },
  category: { type: 'choice', choice: 'ackey', probabilities: { ackey: 0.9, acsta: 0.1 } },
  single_event: { type: 'noul', noul: 0.99 }
}

type Props = { configured?: boolean; audit?: ItemCountAudit | null; answers?: Record<string, ClefAnswer> }
const render = ({ configured = true, audit, answers: values = answers }: Props = {}) =>
  renderToStaticMarkup(
    createElement(WebhookAnswerTable, {
      answers: values,
      ...(configured ? { thresholds: DEFAULT_DETECTION_THRESHOLDS } : {}),
      ...(audit === undefined ? {} : { itemCountAudit: audit })
    })
  )
const countCell = (markup: string) => basicCellsOf(markup).find((cell) => cell.key === 'distribution_item_count')

describe('回答表の「配布物の種類数」（件数の監査）のセル', () => {
  test('一致（matched）は他のセルと同じ形（ラベル・回答・確率・ステータス・しきい値）で、確定として出る', () => {
    const cell = countCell(render({ audit: auditOf({}) }))
    expect(cell).toMatchObject({
      label: '配布物の種類数',
      answer: '2種類',
      probability: '95.0%',
      status: '確定',
      note: 'しきい値 70.0%'
    })
    expect(cell?.className).not.toContain('bg-warning/10')
  })

  test('件数のセルは配布物のセルの直後に並ぶ。配布物が無ければ基本判定の末尾に並ぶ', () => {
    const labels = basicCellsOf(render({ audit: auditOf({}) })).map((cell) => cell.label)
    expect(labels).toEqual(['状態', '配布物', '配布物の種類数', '単一イベントか'])
    const { category: _category, ...withoutCategory } = answers
    const tail = basicCellsOf(render({ audit: auditOf({}), answers: withoutCategory })).map((cell) => cell.label)
    expect(tail).toEqual(['状態', '単一イベントか', '配布物の種類数'])
  })

  test('件数のセルは補い行（開催・配布店舗など）より前に並ぶ', () => {
    const markup = renderToStaticMarkup(
      createElement(WebhookAnswerTable, {
        answers,
        thresholds: DEFAULT_DETECTION_THRESHOLDS,
        stores: ['akiba'],
        characterIds: ['funabashi'],
        itemCountAudit: auditOf({})
      })
    )
    expect(basicCellsOf(markup).map((cell) => cell.label)).toEqual([
      '状態',
      '配布物',
      '配布物の種類数',
      '単一イベントか',
      '開催・配布店舗',
      '対象ビッカメ娘'
    ])
  })

  test('確率がしきい値未満（low_confidence）は未確定で、理由を補足に添え、警告の背景になる', () => {
    const cell = countCell(render({ audit: auditOf({ status: 'low_confidence', probability: 0.55 }) }))
    expect(cell).toMatchObject({ answer: '2種類', probability: '55.0%', status: '未確定' })
    expect(cell?.note).toBe('しきい値 70.0% · 確率がしきい値未満')
    expect(cell?.className).toContain('bg-warning/10')
  })

  test('不一致・未確定・上限超過も未確定で、それぞれの理由を出す。件数が未確定なら回答は「未確定」', () => {
    const mismatch = countCell(render({ audit: auditOf({ status: 'mismatch', extracted: 3 }) }))
    expect(mismatch).toMatchObject({ answer: '2種類', status: '未確定' })
    expect(mismatch?.note).toContain('抽出3種類と不一致')
    const unknown = countCell(render({ audit: auditOf({ status: 'unknown', expected: null, probability: null }) }))
    expect(unknown).toMatchObject({ answer: '未確定', probability: '—', status: '未確定' })
    expect(unknown?.note).toContain('種類数を確定できない')
    const overflow = countCell(render({ audit: auditOf({ status: 'overflow', expected: null }) }))
    expect(overflow?.note).toContain('21種類以上')
  })

  test('保存したしきい値を出し、現在のしきい値（回答表の設定）では上書きしない', () => {
    const cell = countCell(render({ audit: auditOf({ threshold: 0.8 }) }))
    expect(cell?.note).toBe('しきい値 80.0%')
  })

  test('監査が保存されていない（null）ジョブは「未チェック」を出し、ステータスは — で強調しない', () => {
    const cell = countCell(render({ audit: null }))
    expect(cell).toMatchObject({ answer: '未チェック', probability: '—', status: '—' })
    expect(cell?.note).toContain('再判定時に投稿全体を確認します')
    expect(cell?.className).not.toContain('bg-warning/10')
  })

  test('件数を使わない種類のジョブ（itemCountAudit を渡さない）は、件数のセルを出さない', () => {
    const markup = render()
    expect(countCell(markup)).toBeUndefined()
    expect(markup).not.toContain('配布物の種類数')
  })

  test('現在のしきい値が取れていなくても、件数のセルは保存したしきい値と判定を出し、ほかのセルは — のまま', () => {
    const markup = render({ configured: false, audit: auditOf({ status: 'low_confidence', probability: 0.55 }) })
    const cells = basicCellsOf(markup)
    const count = cells.find((cell) => cell.key === 'distribution_item_count')
    expect(count).toMatchObject({ status: '未確定', note: 'しきい値 70.0% · 確率がしきい値未満' })
    for (const cell of cells.filter((entry) => entry.key !== 'distribution_item_count')) {
      expect(cell.status).toBe('—')
      expect(cell.note).toContain('しきい値 —')
    }
    expect(markup.match(/data-slot="badge"/g)).toHaveLength(1)
  })

  test('回答のセルが無くても、件数のセルがあれば「回答の記録なし」に加えて件数のセルだけを出す', () => {
    const markup = render({ audit: auditOf({}), answers: { is_event: { type: 'noul', noul: 0.99 } } })
    expect(markup).toContain('回答の記録なし')
    expect(groupsOfGrid(markup).map((group) => group.label)).toEqual(['基本判定'])
    expect(basicCellsOf(markup).map((cell) => cell.label)).toEqual(['配布物の種類数'])
    const empty = render({ answers: {} })
    expect(empty).toContain('回答の記録なし')
    expect(gridRootOf(empty)).toBeNull()
  })

  test('フッターに、件数のしきい値は判定時に保存した値であることを添える', () => {
    const NOTE = '配布物の種類数のしきい値は、判定時に保存した値です。'
    expect(render({ audit: auditOf({}) })).toContain(NOTE)
    expect(render({ audit: null })).toContain(NOTE)
    expect(render()).not.toContain(NOTE)
  })
})

describe('受信詳細から回答表へ渡す件数の監査', () => {
  test('親ジョブの itemCountAudit を回答表の件数のセルにし、先頭の節（投稿全体の配布物数チェック）も残す', async () => {
    const markup = await renderDetail(
      { ...listJob, answers, itemCountAudit: auditOf({ status: 'low_confidence', probability: 0.6 }) },
      0.9
    )
    expect(markup).toContain('投稿全体の配布物数チェック')
    const cell = countCell(markup)
    expect(cell).toMatchObject({ answer: '2種類', status: '未確定' })
    expect(cell?.note).toContain('確率がしきい値未満')
  })

  test('監査が保存されていない詳細は「未チェック」のセル、渡されない詳細は件数のセルなし', async () => {
    const unchecked = await renderDetail({ ...listJob, answers, itemCountAudit: null }, 0.9)
    expect(countCell(unchecked)?.answer).toBe('未チェック')
    const absent = await renderDetail({ ...listJob, answers }, 0.9)
    expect(countCell(absent)).toBeUndefined()
  })

  test('回答が null の詳細は「回答の記録なし」のまま、件数のセルを足さず先頭の節だけが件数を示す', async () => {
    const markup = await renderDetail({ ...listJob, answers: null, itemCountAudit: auditOf({}) }, 0.9)
    expect(markup).toContain('回答の記録なし')
    expect(gridRootOf(markup)).toBeNull()
    expect(markup).toContain('投稿全体の配布物数チェック')
  })
})
