import { expect, test } from 'bun:test'
import type { ClefAnswer } from '@biccame/shared/event-detect/clef'
import { DEFAULT_DETECTION_THRESHOLDS } from '@biccame/shared/event-detect/detection'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebhookAnswerTable } from '@/components/admin/webhook-answer-table'
import { groupsOfGrid } from './fixtures/webhook-answer-grid'

// v16 の回答表。1 段目の store / character（choice）に続いて、2 段目の確認（store_confirm / character_confirm）が 1 行ずつ出る。
const answers = (store: number, character: number): Record<string, ClefAnswer> => ({
  is_event: { type: 'noul', noul: 0.99 },
  store: { type: 'choice', choice: 'funabashi', probabilities: { funabashi: 0.8, akiba: 0.1 } },
  character: { type: 'choice', choice: 'funato', probabilities: { funato: 0.8, akiba: 0.1 } },
  store_confirm: { type: 'noul', noul: store },
  character_confirm: { type: 'noul', noul: character }
})
const render = (values: Record<string, ClefAnswer>) =>
  renderToStaticMarkup(createElement(WebhookAnswerTable, { answers: values, thresholds: DEFAULT_DETECTION_THRESHOLDS }))
const cellsOf = (markup: string) => groupsOfGrid(markup).flatMap((group) => group.cells)
const labelsOf = (markup: string) => cellsOf(markup).map((cell) => cell.label)
const cellOf = (markup: string, label: string) => cellsOf(markup).find((cell) => cell.label === label)

test('確認の質問が 1 セルずつ出て、質問の文言（対象の名前を添えない素のラベル）・「はい」の確率・しきい値・確定が読める', () => {
  const markup = render(answers(0.85, 0.9))
  const store = cellOf(markup, '開催・配布店舗の確認')
  const character = cellOf(markup, '対象ビッカメ娘の確認')
  expect(store).toMatchObject({ answer: 'はい', probability: '85.0%', status: '確定' })
  expect(store?.note).toContain('しきい値 70.0%')
  expect(character).toMatchObject({ answer: 'はい', probability: '90.0%', status: '確定' })
  // 確認のセルのラベルに、1 段目で選んだ店舗・娘の名前は付かない。
  expect(store?.html).not.toContain('船橋駅FACE店')
  expect(character?.html).not.toContain('ふなとーたん')
  // 1 段目のセル（開催・配布店舗、対象ビッカメ娘）の直後に並ぶ。
  const labels = labelsOf(markup)
  expect(labels.indexOf('開催・配布店舗の確認')).toBe(labels.indexOf('開催・配布店舗') + 1)
  expect(labels.indexOf('対象ビッカメ娘の確認')).toBe(labels.indexOf('対象ビッカメ娘') + 1)
})

test('判定を確認が担う 1 段目の店舗・娘のセルは、ステータスを — にして未確定の強調を付けず、効いているしきい値を出す', () => {
  const markup = render(answers(0.85, 0.9))
  for (const label of ['開催・配布店舗', '対象ビッカメ娘']) {
    const cell = cellOf(markup, label)
    expect(cell?.status).toBe('—')
    expect(cell?.className).not.toContain('bg-warning/10')
    expect(cell?.html).not.toContain('data-slot="badge"')
    expect(cell?.note).toContain('しきい値 70.0%')
  }
  // 保存された項目別のしきい値があれば、その実効値を出す。
  const saved = renderToStaticMarkup(
    createElement(WebhookAnswerTable, {
      answers: answers(0.85, 0.9),
      thresholds: { ...DEFAULT_DETECTION_THRESHOLDS, fieldThresholds: { store: 0.6, character: 0.5 } }
    })
  )
  expect(cellOf(saved, '開催・配布店舗')?.note).toContain('しきい値 60.0%')
  expect(cellOf(saved, '対象ビッカメ娘')?.note).toContain('しきい値 50.0%')
})

test('確認の確率が下限（70%）未満のセルは「未確定」で、警告の背景になる。下限以上のセルは「確定」', () => {
  const markup = render(answers(0.69, 0.7))
  const store = cellOf(markup, '開催・配布店舗の確認')
  const character = cellOf(markup, '対象ビッカメ娘の確認')
  expect(store?.status).toBe('未確定')
  expect(store?.className).toContain('bg-warning/10')
  expect(character?.status).toBe('確定')
  expect(character?.className).not.toContain('bg-warning/10')
})

test('確認のセルは基本判定のグループに並び、1 段目の store / character と同じグリッドに収まる（セルは 4 つ。is_event は出さない）', () => {
  const markup = render(answers(0.85, 0.9))
  expect(groupsOfGrid(markup).map((group) => group.label)).toEqual(['基本判定'])
  expect(cellsOf(markup)).toHaveLength(4)
  expect(markup).not.toContain('ビッカメ娘のイベントか')
})

test('確認の行が無い保存データ（v15 以前）の表は、確認のセルを足さず、1 段目のステータスを従来どおり出す', () => {
  const { store_confirm: _store, character_confirm: _character, ...v15 } = answers(0.9, 0.9)
  const markup = render(v15)
  expect(markup).not.toContain('の確認')
  expect(cellsOf(markup)).toHaveLength(2)
  for (const cell of cellsOf(markup)) {
    expect(cell.status).toBe('確定')
    expect(cell.note).toContain('しきい値 70.0%')
  }
})

test('店舗の娘（店舗と同じ ID）にも娘の確認を聞くので、開催・配布店舗の確認と対象ビッカメ娘の確認の両方のセルが出る', () => {
  const storeCharacter: Record<string, ClefAnswer> = {
    ...answers(0.85, 0.9),
    character: { type: 'choice', choice: 'funabashi', probabilities: { funabashi: 0.8, akiba: 0.1 } }
  }
  const markup = render(storeCharacter)
  const labels = labelsOf(markup)
  expect(labels).toContain('開催・配布店舗の確認')
  // 添え字は付けない。並びは「対象ビッカメ娘」の次。
  expect(labels).toContain('対象ビッカメ娘の確認')
  expect(labels.indexOf('対象ビッカメ娘の確認')).toBe(labels.indexOf('対象ビッカメ娘') + 1)
  expect(labels.indexOf('開催・配布店舗の確認')).toBe(labels.indexOf('開催・配布店舗') + 1)
  expect(cellOf(markup, '対象ビッカメ娘')?.answer).toBe('ふなたん')
  expect(cellsOf(markup)).toHaveLength(4)
})

test('旧版の保存データ（店舗の娘で娘の確認の質問が無い）の表は、店舗の確認のセルだけが出て、壊れない', () => {
  const { character_confirm: _character, ...asked } = answers(0.85, 0.9)
  const storeCharacter: Record<string, ClefAnswer> = {
    ...asked,
    character: { type: 'choice', choice: 'funabashi', probabilities: { funabashi: 0.8, akiba: 0.1 } }
  }
  const labels = labelsOf(render(storeCharacter))
  expect(labels).toContain('開催・配布店舗の確認')
  expect(labels.some((label) => label?.startsWith('対象ビッカメ娘の確認'))).toBe(false)
  // 1 段目の娘のセルは残る（確認のセルだけが無い）。
  expect(labels).toContain('対象ビッカメ娘')
  expect(labels).toHaveLength(3)
})
