import { expect, test } from 'bun:test'
import type { ClefAnswer } from '@biccame/shared/event-detect/clef'
import { DEFAULT_DETECTION_THRESHOLDS } from '@biccame/shared/event-detect/detection'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebhookAnswerTable } from '@/components/admin/webhook-answer-table'

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
const rowsOf = (markup: string) =>
  [...markup.matchAll(/<tr\b[^>]*>(.*?)<\/tr>/g)]
    .filter((match) => match[1]?.includes('<td'))
    .map((match) => ({
      html: match[0],
      text: match[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    }))

test('確認の質問が 1 行ずつ出て、質問の文言・対象の名前・「はい」の確率・しきい値・確定が読める', () => {
  const rows = rowsOf(render(answers(0.85, 0.9)))
  const store = rows.find((row) => row.text.startsWith('開催・配布店舗の確認'))
  const character = rows.find((row) => row.text.startsWith('対象ビッカメ娘の確認'))
  expect(store?.text).toContain('船橋駅FACE店')
  expect(store?.text).toContain('はい')
  expect(store?.text).toContain('85.0%')
  expect(store?.text).toContain('70.0%')
  expect(store?.text).toContain('確定')
  expect(character?.text).toContain('ふなとーたん')
  expect(character?.text).toContain('90.0%')
  // 1 段目の行（開催・配布店舗、対象ビッカメ娘）の直後に並ぶ。
  const labels = rows.map((row) => row.text.split(' ')[0])
  expect(labels.indexOf('開催・配布店舗の確認（船橋駅FACE店）')).toBe(labels.indexOf('開催・配布店舗') + 1)
  expect(labels.indexOf('対象ビッカメ娘の確認（ふなとーたん）')).toBe(labels.indexOf('対象ビッカメ娘') + 1)
})

test('確認の確率が下限（70%）未満の行は「未確定」で、警告の背景になる。下限以上の行は「確定」', () => {
  const rows = rowsOf(render(answers(0.69, 0.7)))
  const store = rows.find((row) => row.text.startsWith('開催・配布店舗の確認'))
  const character = rows.find((row) => row.text.startsWith('対象ビッカメ娘の確認'))
  expect(store?.text).toContain('未確定')
  expect(store?.html).toContain('bg-warning/10')
  expect(character?.text).toContain('確定')
  expect(character?.text).not.toContain('未確定')
  expect(character?.html).not.toContain('bg-warning/10')
})

test('確認の行は基本判定のグループに並び、1 段目の store / character と同じ表に収まる（行数は 5 行）', () => {
  const markup = render(answers(0.85, 0.9))
  const bodies = [...markup.matchAll(/<tbody\b[^>]*aria-label="([^"]+)"/g)].map((match) => match[1])
  expect(bodies).toEqual(['基本判定'])
  expect(rowsOf(markup)).toHaveLength(5)
})

test('確認の行が無い保存データ（v15 以前）の表は、確認の行を足さない', () => {
  const { store_confirm: _store, character_confirm: _character, ...v15 } = answers(0.9, 0.9)
  const markup = render(v15)
  expect(markup).not.toContain('の確認')
  expect(rowsOf(markup)).toHaveLength(3)
})

test('店舗の娘（店舗と同じ ID）は娘の確認を聞かないので、店舗の確認の行だけが出て、表は壊れない', () => {
  const { character_confirm: _character, ...asked } = answers(0.85, 0.9)
  const storeCharacter: Record<string, ClefAnswer> = {
    ...asked,
    character: { type: 'choice', choice: 'funabashi', probabilities: { funabashi: 0.8, akiba: 0.1 } }
  }
  const markup = render(storeCharacter)
  const rows = rowsOf(markup)
  const labels = rows.map((row) => row.text.split(' ')[0])
  expect(labels).toContain('開催・配布店舗の確認（船橋駅FACE店）')
  expect(labels.some((label) => label.startsWith('対象ビッカメ娘の確認'))).toBe(false)
  // 1 段目の娘の行は残る（確認の行だけが無い）。
  expect(labels).toContain('対象ビッカメ娘')
  expect(rows).toHaveLength(4)
})
