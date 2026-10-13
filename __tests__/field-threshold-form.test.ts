import { describe, expect, test } from 'bun:test'
import {
  FIELD_THRESHOLD_KEYS,
  type FieldThresholds,
  resolveFieldThresholds
} from '@biccame/shared/event-detect/detection'
import {
  botConfigurationForm,
  fieldThresholdInputValue,
  percentToThreshold,
  THRESHOLD_EMPTY_ERROR,
  THRESHOLD_RANGE_ERROR,
  thresholdInputError,
  thresholdToPercentText
} from '@/components/admin/field-threshold-form'

// 項目ごとに値を変えて、キーの取り違えを検出できるようにする。
const saved: FieldThresholds = {
  single_event: 0.9,
  status: 0.8,
  category: 0.91,
  store: 0.92,
  start_date: 0.93,
  end_date: 0.94,
  quantity: 0.95,
  condition: 0.96,
  purchase_amount: 0.825
}
const base = { savedModel: 'clef', selectedModel: null, savedThresholds: saved, drafts: {}, busy: false } as const

describe('percentToThreshold', () => {
  test('%を 0〜1 に変換し、浮動小数点ノイズを出さず小数第3位に丸める', () => {
    expect(percentToThreshold('82.5')).toBe(0.825)
    expect(percentToThreshold('90')).toBe(0.9)
    expect(percentToThreshold('80')).toBe(0.8)
    expect(percentToThreshold('57.3')).toBe(0.573)
    expect(percentToThreshold('99.9')).toBe(0.999)
    expect(percentToThreshold('0.1')).toBe(0.001)
    expect(percentToThreshold('100')).toBe(1)
    expect(percentToThreshold(' 90 ')).toBe(0.9)
  })

  test('範囲外・数値以外・小数2桁以上は null', () => {
    for (const text of [
      '',
      ' ',
      '0',
      '0.0',
      '0.05',
      '-5',
      '100.1',
      '101',
      'abc',
      '90%',
      '1e2',
      '.5',
      '82.55',
      '8 2',
      'NaN',
      'Infinity',
      '９０'
    ])
      expect(percentToThreshold(text), JSON.stringify(text)).toBeNull()
  })

  test('0.1% 刻みのどの値も、表示用の文字列を経由して元の値に戻る', () => {
    for (const step of Array.from({ length: 1000 }, (_, index) => index + 1)) {
      const value = step / 1000
      expect(percentToThreshold(thresholdToPercentText(value)), String(value)).toBe(value)
    }
  })
})

describe('thresholdToPercentText', () => {
  test('0〜1 の値を%の文字列にする（不要な小数は出さない）', () => {
    expect(thresholdToPercentText(0.9)).toBe('90')
    expect(thresholdToPercentText(0.8)).toBe('80')
    expect(thresholdToPercentText(0.825)).toBe('82.5')
    expect(thresholdToPercentText(1)).toBe('100')
    expect(thresholdToPercentText(0.001)).toBe('0.1')
    expect(thresholdToPercentText(0.7)).toBe('70')
  })
})

describe('thresholdInputError', () => {
  test('空・数値以外・0以下・100超はエラー、範囲内は null', () => {
    expect(thresholdInputError('')).toBe(THRESHOLD_EMPTY_ERROR)
    expect(thresholdInputError('  ')).toBe(THRESHOLD_EMPTY_ERROR)
    for (const text of ['abc', '0', '-1', '100.1', '82.55'])
      expect(thresholdInputError(text), text).toBe(THRESHOLD_RANGE_ERROR)
    for (const text of ['0.1', '50', '82.5', '100']) expect(thresholdInputError(text), text).toBeNull()
  })
})

describe('fieldThresholdInputValue', () => {
  test('編集していない項目は保存済みの値を%で、編集中の項目は入力文字列をそのまま出す', () => {
    expect(fieldThresholdInputValue(saved, {}, 'status')).toBe('80')
    expect(fieldThresholdInputValue(saved, {}, 'purchase_amount')).toBe('82.5')
    expect(fieldThresholdInputValue(saved, { status: '7' }, 'status')).toBe('7')
    expect(fieldThresholdInputValue(saved, { status: '' }, 'status')).toBe('')
    expect(fieldThresholdInputValue(saved, { status: '7' }, 'category')).toBe('91')
  })
})

describe('botConfigurationForm', () => {
  test('変更が無ければ保存は無効で、送る body は保存済みの値そのまま', () => {
    const form = botConfigurationForm(base)
    expect(form.canSave).toBe(false)
    expect(form.errors).toEqual({})
    expect(form.request).toEqual({ model: 'clef', fieldThresholds: saved })
  })

  test('値を変えると有効になり、変えた項目だけが 0〜1 に変換されて送られる', () => {
    const form = botConfigurationForm({ ...base, drafts: { status: '82.5' } })
    expect(form.canSave).toBe(true)
    expect(form.errors).toEqual({})
    expect(form.request).toEqual({ model: 'clef', fieldThresholds: { ...saved, status: 0.825 } })
    const twoFields = botConfigurationForm({ ...base, drafts: { status: '90', start_date: '99.5' } })
    expect(twoFields.request).toEqual({ model: 'clef', fieldThresholds: { ...saved, status: 0.9, start_date: 0.995 } })
  })

  test('編集していない項目は保存値を変換せず送る（環境変数由来の小数も丸めない）', () => {
    const precise = { ...saved, category: 0.8765 }
    const form = botConfigurationForm({ ...base, savedThresholds: precise, drafts: { status: '70' } })
    expect(form.request?.fieldThresholds.category).toBe(0.8765)
    // 表示は丸めても、触っていなければ変更扱いにしない。
    expect(botConfigurationForm({ ...base, savedThresholds: precise }).canSave).toBe(false)
  })

  test('保存済みと同じ値を入力し直しても変更扱いにしない', () => {
    expect(botConfigurationForm({ ...base, drafts: { status: '80', purchase_amount: '82.5' } }).canSave).toBe(false)
    expect(botConfigurationForm({ ...base, drafts: { status: '70' } }).canSave).toBe(true)
  })

  test('モデルだけが変わっても有効で、選択中のモデルを送る', () => {
    const form = botConfigurationForm({ ...base, selectedModel: 'clef-flash' })
    expect(form.canSave).toBe(true)
    expect(form.request).toEqual({ model: 'clef-flash', fieldThresholds: saved })
    expect(botConfigurationForm({ ...base, selectedModel: 'clef' }).canSave).toBe(false)
  })

  test('モデルとしきい値の両方が変わっても、1回の保存で両方を送る', () => {
    const form = botConfigurationForm({ ...base, selectedModel: 'clef-flash', drafts: { status: '70' } })
    expect(form.canSave).toBe(true)
    expect(form.request).toEqual({ model: 'clef-flash', fieldThresholds: { ...saved, status: 0.7 } })
  })

  test('不正な入力は行ごとのエラーになり、保存は無効で body は作らない', () => {
    const cases: [string, string][] = [
      ['', THRESHOLD_EMPTY_ERROR],
      ['abc', THRESHOLD_RANGE_ERROR],
      ['0', THRESHOLD_RANGE_ERROR],
      ['-5', THRESHOLD_RANGE_ERROR],
      ['100.1', THRESHOLD_RANGE_ERROR],
      ['82.55', THRESHOLD_RANGE_ERROR]
    ]
    for (const [text, message] of cases) {
      const form = botConfigurationForm({ ...base, drafts: { status: text } })
      expect(form.errors, JSON.stringify(text)).toEqual({ status: message })
      expect(form.canSave, JSON.stringify(text)).toBe(false)
      expect(form.request, JSON.stringify(text)).toBeNull()
    }
  })

  test('他の項目が正しく変わっていても、1行でも不正なら保存は無効', () => {
    const form = botConfigurationForm({
      ...base,
      selectedModel: 'clef-flash',
      drafts: { status: '70', category: '' }
    })
    expect(form.errors).toEqual({ category: THRESHOLD_EMPTY_ERROR })
    expect(form.canSave).toBe(false)
    expect(form.request).toBeNull()
    // エラーは不正な行にだけ付き、直せば保存できる。
    const fixed = botConfigurationForm({ ...base, drafts: { status: '70', category: '91.5' } })
    expect(fixed.errors).toEqual({})
    expect(fixed.canSave).toBe(true)
  })

  test('処理中・データ未取得のときは保存できない', () => {
    expect(botConfigurationForm({ ...base, drafts: { status: '70' }, busy: true }).canSave).toBe(false)
    const loading = botConfigurationForm({ ...base, savedModel: undefined, savedThresholds: undefined })
    expect(loading).toEqual({ errors: {}, request: null, canSave: false })
    expect(botConfigurationForm({ ...base, savedThresholds: undefined, drafts: { status: '70' } }).canSave).toBe(false)
    expect(botConfigurationForm({ ...base, savedModel: undefined, selectedModel: 'clef-flash' }).canSave).toBe(false)
  })

  test('送る body は9項目すべてを含み、既定値（status 0.8）の設定でも欠けない', () => {
    const form = botConfigurationForm({
      ...base,
      savedThresholds: resolveFieldThresholds(0.9),
      drafts: { store: '50' }
    })
    if (form.request === null) throw new Error('Expected a request')
    expect(Object.keys(form.request.fieldThresholds).sort()).toEqual([...FIELD_THRESHOLD_KEYS].sort())
    expect(form.request.fieldThresholds.status).toBe(0.8)
    expect(form.request.fieldThresholds.store).toBe(0.5)
  })
})
