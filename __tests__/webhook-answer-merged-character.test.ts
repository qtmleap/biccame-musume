import { describe, expect, test } from 'bun:test'
import type { ClefAnswer } from '@biccame/shared/event-detect/clef'
import { DEFAULT_DETECTION_THRESHOLDS } from '@biccame/shared/event-detect/detection'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebhookAnswerTable } from '@/components/admin/webhook-answer-table'
import { detectionScoreLabel } from '@/components/admin/webhook-labels'
import { basicCellsOf } from './fixtures/webhook-answer-grid'
import { baseJob, renderDetail } from './fixtures/webhook-rejudge'

// 対象ビッカメ娘の行: 店舗が具体的な S（あべの店）のとき、店舗の娘（store_character）と S の娘（あべのたん）は同じ人物なので、
// 確率を割らずに合算して出す。判定は変えず、表示だけ。実データ: 投稿 2114543815453491225（@bic_abeno、あべの店のアクリルキーホルダー、v18）。
const answers: Record<string, ClefAnswer> = {
  store: { type: 'choice', choice: 'abeno', probabilities: { abeno: 0.7881, none: 0.05 } },
  character: {
    type: 'choice',
    choice: 'store_character',
    probabilities: { store_character: 0.7421, abeno: 0.1244, other: 0.0236, none: 0.0081 }
  }
}

const render = (value: Record<string, ClefAnswer>) =>
  renderToStaticMarkup(createElement(WebhookAnswerTable, { answers: value, thresholds: DEFAULT_DETECTION_THRESHOLDS }))
const characterCell = (markup: string) => {
  const cell = basicCellsOf(markup).find((entry) => entry.key === 'character')
  if (cell === undefined) throw new Error('Missing character cell')
  return cell
}

describe('回答表の対象ビッカメ娘のセル', () => {
  test('実データ: 回答は「店舗の娘（あべのたん）」、確率は合算値、次点は その他 と 該当なし、確定', () => {
    const cell = characterCell(render(answers))
    expect(cell.label).toBe('対象ビッカメ娘')
    expect(cell.answer).toBe('店舗の娘（あべのたん）')
    // 0.7421 + 0.1244 を丸めの前に足して 0.8665。保存値は 4 桁なので、画面は 86.7%（detectionScoreLabel の表示値）。86.6% に合わせる特別扱いはしない。
    expect(detectionScoreLabel(0.8665)).toBe('86.7%')
    expect(cell.probability).toBe('86.7%')
    expect(cell.status).toBe('確定')
    expect(cell.note).toContain('しきい値 70.0%')
    expect(cell.note).toContain('次点 その他 2.4% / 該当なし 0.8%')
    // 割った値（店舗の娘 74.2%）と、次点のあべのたん 12.4% は出ない。
    expect(cell.probability).not.toContain('74.2')
    expect(cell.note).not.toContain('あべのたん')
    expect(cell.note).not.toContain('12.4')
  })

  test('最上位が S の娘自身: 回答は「あべのたん」、確率は 85.0%', () => {
    const cell = characterCell(
      render({
        ...answers,
        character: {
          type: 'choice',
          choice: 'abeno',
          probabilities: { abeno: 0.45, store_character: 0.4, other: 0.1, none: 0.05 }
        }
      })
    )
    expect(cell.answer).toBe('あべのたん')
    expect(cell.probability).toBe('85.0%')
    expect(cell.note).toContain('次点 その他 10.0% / 該当なし 5.0%')
  })

  test('まとめない（店舗が none）: 従来どおり「店舗の娘」74.2% に、次点 あべのたん 12.4%', () => {
    const cell = characterCell(
      render({ ...answers, store: { type: 'choice', choice: 'none', probabilities: { none: 0.8, abeno: 0.1 } } })
    )
    expect(cell.answer).toBe('店舗の娘')
    expect(cell.probability).toBe('74.2%')
    expect(cell.note).toContain('次点 あべのたん 12.4% / その他 2.4%')
  })

  test('character_confirm があるときは、ステータスは — のまま（判定は確認の行が担う）で、確率は合算値', () => {
    const cell = characterCell(
      render({
        ...answers,
        store_confirm: { type: 'noul', noul: 0.9 },
        character_confirm: { type: 'noul', noul: 0.9 }
      })
    )
    expect(cell.answer).toBe('店舗の娘（あべのたん）')
    expect(cell.probability).toBe('86.7%')
    expect(cell.status).toBe('—')
    expect(cell.note).toContain('しきい値 70.0%')
  })

  test('詳細画面の描画でも、合算値と「店舗の娘（あべのたん）」が出る', async () => {
    const markup = await renderDetail({ ...baseJob, answers })
    const cell = characterCell(markup)
    expect(cell.answer).toBe('店舗の娘（あべのたん）')
    expect(cell.probability).toBe('86.7%')
  })
})
