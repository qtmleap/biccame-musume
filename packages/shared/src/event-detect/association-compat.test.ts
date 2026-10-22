import { describe, expect, test } from 'bun:test'
import { describeAnswers, questionLabel, reasonLabel } from './answer-view'
import { thresholds } from './answer-view-test-fixtures'
import type { ClefAnswer } from './clef'
import { buildDetectionDraft, DEFAULT_DETECTION_THRESHOLDS, thresholdOf } from './detection'
import { choice, post } from './detection-test-fixtures'

// 版ごとに回答の形が違う保存データ（v2: store choice／v3〜v12: venue.* と character.* の noul／v13: store と character の choice）を、
// どれも壊さずに下書きと回答表へ読めることを固定する。

const value = post()
const common: Record<string, ClefAnswer> = {
  category: choice('ackey', { ackey: 0.9 }),
  start_date: choice('d20261103', { d20261103: 0.9 }),
  condition: choice('everyone', { everyone: 0.9 })
}
const noul = (probability: number): ClefAnswer => ({ type: 'noul', noul: probability })

describe('下書き: 版ごとの回答の読み分け', () => {
  test('v2: store の choice だけを読み、対象ビッカメ娘は補完しない', () => {
    const draft = buildDetectionDraft(value, {
      ...common,
      store: choice('hamamatsu', { hamamatsu: 0.9311, none: 0.0689 })
    })
    expect(draft).toMatchObject({ stores: ['hamamatsu'], characterIds: [], category: 'ackey' })
    expect(buildDetectionDraft(value, { ...common, store: choice('none', { none: 0.9 }) })).toMatchObject({
      stores: [],
      characterIds: []
    })
  })
  test('v2: 条件の回答が無い保存応答でも下書きを作れ、本文に条件の語が無ければ全員、あれば空にする', () => {
    const saved: Record<string, ClefAnswer> = { ...common, store: choice('abeno', { abeno: 0.9 }) }
    const { condition: _condition, ...old } = saved
    expect(buildDetectionDraft(post('あべのたん限定名刺を11月3日から配布します'), old)).toMatchObject({
      stores: ['abeno'],
      conditions: [{ type: 'everyone' }]
    })
    expect(buildDetectionDraft(post('あべのたん限定名刺を11月3日から先着100枚配布します'), old).conditions).toEqual([])
  })
  test('v3〜v12: venue.* と character.* の noul を 0.5 以上で採用し、複数も保持する', () => {
    const draft = buildDetectionDraft(value, {
      ...common,
      'venue.funabashi': noul(0.97),
      'venue.abeno': noul(0.6),
      'venue.akiba': noul(0.2),
      'character.funato': noul(0.99),
      'character.funabashi': noul(0.55),
      'character.abeno': noul(0.01)
    })
    expect(draft.stores).toEqual(['abeno', 'funabashi'])
    expect(draft.characterIds).toEqual(['funabashi', 'funato'])
  })
  test('v3〜v12: venue.* があれば、同じ回答にある store の choice は読まない', () => {
    const draft = buildDetectionDraft(value, {
      ...common,
      store: choice('akiba', { akiba: 0.9 }),
      'venue.funabashi': noul(0.97)
    })
    expect(draft.stores).toEqual(['funabashi'])
  })
  test('v13: store と character の choice の最有力を採用する（しきい値は適用しない）', () => {
    const draft = buildDetectionDraft(value, {
      ...common,
      store: choice('funabashi', { funabashi: 0.4, none: 0.3 }),
      character: choice('funato', { funato: 0.4, funabashi: 0.3 })
    })
    expect(draft).toMatchObject({ stores: ['funabashi'], characterIds: ['funato'] })
    expect(draft.title).toContain('船橋駅FACE店')
  })
  test.each(['none', 'multiple'])('v13: 店舗が %s なら店舗は空にする', (selected) => {
    const draft = buildDetectionDraft(value, { ...common, store: choice(selected, { [selected]: 0.9 }) })
    expect(draft.stores).toEqual([])
    expect(draft.title).toBeUndefined()
  })
  test.each(['none', 'multiple'])(
    'v13: 娘が %s なら対象は空にする（共同絵柄は人が編集フォームで指定する）',
    (selected) => {
      const draft = buildDetectionDraft(value, {
        ...common,
        store: choice('funabashi', { funabashi: 0.9 }),
        character: choice(selected, { [selected]: 0.9 })
      })
      expect(draft.characterIds).toEqual([])
      expect(draft.stores).toEqual(['funabashi'])
    }
  )
  test.each(['other', 'secret'])('v13: 娘が %s なら、その特別な値を対象にする', (selected) => {
    const draft = buildDetectionDraft(value, { ...common, character: choice(selected, { [selected]: 0.9 }) })
    expect(draft.characterIds).toEqual([selected])
  })
  test('v13: 辞書にない店舗・娘や型違いの回答は、投げずに空にする', () => {
    const draft = buildDetectionDraft(value, {
      ...common,
      store: choice('invented', { invented: 0.9 }),
      character: { type: 'noul', noul: 0.9 }
    })
    expect(draft).toMatchObject({ stores: [], characterIds: [] })
  })
})

describe('回答表: v13 の store / character は choice の行', () => {
  const rowsOf = (answers: Record<string, ClefAnswer>) => describeAnswers(answers, thresholds)

  test('店舗の行は「開催・配布店舗」。回答は「ビックカメラ」を付けない店舗名、確率としきい値、次点を持つ', () => {
    const [row] = rowsOf({ store: choice('funabashi', { funabashi: 0.95, akiba: 0.03, none: 0.01 }) })
    expect(row).toMatchObject({
      key: 'store',
      label: '開催・配布店舗',
      answer: '船橋駅FACE店',
      probability: 0.95,
      threshold: 0.9,
      confirmed: true
    })
    expect(row?.alternatives).toEqual([
      { answer: 'AKIBA店', probability: 0.03 },
      { answer: '店舗なし', probability: 0.01 }
    ])
    expect(row?.answer).not.toContain('ビックカメラ')
  })
  test('娘の行は「対象ビッカメ娘」。娘の名前で出し、しきい値は共通値、未満なら未確定', () => {
    const [row] = rowsOf({ character: choice('funato', { funato: 0.6, funabashi: 0.3, multiple: 0.05 }) })
    expect(row).toMatchObject({
      key: 'character',
      label: '対象ビッカメ娘',
      answer: 'ふなとーたん',
      probability: 0.6,
      threshold: 0.9,
      confirmed: false
    })
    expect(row?.alternatives).toEqual([
      { answer: 'ふなたん', probability: 0.3 },
      { answer: '複数', probability: 0.05 }
    ])
  })
  test.each([
    ['none', '該当なし'],
    ['multiple', '複数'],
    ['other', 'その他'],
    ['secret', 'シークレット']
  ])('娘の特別な値 %s は日本語「%s」にする', (selected, label) => {
    expect(rowsOf({ character: choice(selected, { [selected]: 0.9 }) })[0]?.answer).toBe(label)
  })
  test.each([
    ['none', '店舗なし'],
    ['multiple', '複数']
  ])('店舗の特別な値 %s は日本語「%s」にする', (selected, label) => {
    expect(rowsOf({ store: choice(selected, { [selected]: 0.9 }) })[0]?.answer).toBe(label)
  })
  test('未知の店舗・娘はキーのまま出し、例外にしない', () => {
    const rows = rowsOf({ store: choice('closed_store', { closed_store: 0.9 }), character: choice('x', { x: 0.9 }) })
    expect(rows.map((row) => row.answer)).toEqual(['closed_store', 'x'])
  })
  test('店舗がカタログにあるが店舗キーでない値は、カタログ名から「ビックカメラ」の接頭辞を取って出す', () => {
    // 現在のカタログの店舗はすべて店舗キーなので、ここでは接頭辞の取り方だけを確かめる（辞書にない id はキーのまま）。
    expect(rowsOf({ store: choice('akiba', { akiba: 0.9 }) })[0]?.answer).toBe('AKIBA店')
  })
  test('行の順は店舗の次に娘ではなく、既知の質問の並び（店舗 → 娘 → 開始日）に従う', () => {
    const rows = rowsOf({
      character: choice('funato', { funato: 0.9 }),
      start_date: choice('d20261103', { d20261103: 0.9 }),
      store: choice('funabashi', { funabashi: 0.9 })
    })
    expect(rows.map((row) => row.key)).toEqual(['store', 'character', 'start_date'])
  })
  test('character のしきい値は共通値 fieldThreshold で、store の項目別設定に影響されない', () => {
    expect(thresholdOf(DEFAULT_DETECTION_THRESHOLDS, 'character')).toBe(0.9)
    expect(
      thresholdOf(
        { ...DEFAULT_DETECTION_THRESHOLDS, fieldThreshold: 0.7, fieldThresholds: { store: 0.99 } },
        'character'
      )
    ).toBe(0.7)
    expect(thresholdOf({ ...DEFAULT_DETECTION_THRESHOLDS, fieldThresholds: { store: 0.99 } }, 'store')).toBe(0.99)
  })
})

describe('回答表: v3〜v12 の venue.* / character.* は従来どおり', () => {
  test('質問名は店舗名・娘の名前を含み、noul の「はい」「いいえ」と確率を従来どおり出す', () => {
    expect(questionLabel('venue.funabashi')).toContain('船橋駅FACE店')
    expect(questionLabel('character.funato')).toBe('対象ビッカメ娘: ふなとーたん')
    const rows = describeAnswers(
      { 'venue.funabashi': noul(0.97), 'character.funato': noul(0.001), 'character.abeno': noul(0.99) },
      thresholds
    )
    expect(rows.map((row) => [row.key, row.answer, row.confirmed])).toEqual([
      ['venue.funabashi', 'はい', true],
      ['character.funato', 'いいえ', true],
      ['character.abeno', 'はい', true]
    ])
    expect(rows[0]?.alternatives).toEqual([{ answer: 'いいえ', probability: 0.03 }])
  })
  test('v2 の store choice の行は「開催・配布店舗」で、店舗名は短い名前', () => {
    const [row] = describeAnswers({ store: choice('hamamatsu', { hamamatsu: 0.93, none: 0.07 }) }, thresholds)
    expect(row).toMatchObject({ label: '開催・配布店舗', answer: '浜松店', confirmed: true })
  })
})

describe('理由コード', () => {
  test('store_mismatch に日本語ラベルがある', () => {
    expect(reasonLabel('store_mismatch')).toBe('抽出した開催店舗と判定した店舗が一致しない')
  })
})
