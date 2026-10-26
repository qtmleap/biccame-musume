import { describe, expect, test } from 'bun:test'
import {
  FIELD_THRESHOLD_KEYS,
  type FieldThresholds,
  resolveFieldThresholds
} from '@biccame/shared/event-detect/detection'
import { AdminBotConfigurationRequestSchema, type EventThresholds } from '@biccame/shared/schemas/admin-bot.dto'
import {
  botConfigurationForm,
  eventThresholdInputValue,
  fieldThresholdInputValue,
  IGNORE_THRESHOLD_ORDER_ERROR,
  IGNORE_THRESHOLD_RANGE_ERROR,
  percentToThreshold,
  THRESHOLD_EMPTY_ERROR,
  THRESHOLD_RANGE_ERROR,
  thresholdInputError,
  thresholdToPercentText
} from '@/components/admin/field-threshold-form'

// 項目ごとに値を変えて、キーの取り違えを検出できるようにする。
const saved: FieldThresholds = {
  status: 0.8,
  category: 0.91,
  store: 0.92,
  store_confirm: 0.71,
  character: 0.72,
  character_confirm: 0.73,
  start_date: 0.93,
  end_date: 0.94,
  quantity: 0.95,
  condition: 0.96,
  purchase_amount: 0.825,
  charge_amount: 0.97
}
// 判定全体の3つ。登録 90%・対象外 50%・必須項目の選択 90%（環境変数の既定値）。
const savedEvent: EventThresholds = { eventThreshold: 0.9, ignoreThreshold: 0.5, choiceThreshold: 0.9 }
const base = {
  savedModel: 'clef',
  selectedModel: null,
  savedEventThresholds: savedEvent,
  savedThresholds: saved,
  drafts: {},
  busy: false
} as const

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

describe('対象外の閾値（0% を許す）', () => {
  test('percentToThreshold は allowZero のときだけ 0% を通し、他の範囲外は同じく null', () => {
    expect(percentToThreshold('0')).toBeNull()
    expect(percentToThreshold('0', true)).toBe(0)
    expect(percentToThreshold('0.0', true)).toBe(0)
    expect(percentToThreshold('0.1', true)).toBe(0.001)
    expect(percentToThreshold('50', true)).toBe(0.5)
    for (const text of ['', '-1', '-0.1', '100.1', 'abc', '5.55', '1e2'])
      expect(percentToThreshold(text, true), JSON.stringify(text)).toBeNull()
  })

  test('thresholdInputError は allowZero のとき 0 を許し、範囲エラーの文言も 0 始まりになる', () => {
    expect(thresholdInputError('0')).toBe(THRESHOLD_RANGE_ERROR)
    expect(thresholdInputError('0', true)).toBeNull()
    expect(thresholdInputError('', true)).toBe(THRESHOLD_EMPTY_ERROR)
    expect(thresholdInputError('100.1', true)).toBe(IGNORE_THRESHOLD_RANGE_ERROR)
    expect(IGNORE_THRESHOLD_RANGE_ERROR).toContain('0〜100')
    expect(IGNORE_THRESHOLD_RANGE_ERROR).not.toBe(THRESHOLD_RANGE_ERROR)
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
    expect(form.request).toEqual({ model: 'clef', thresholds: savedEvent, fieldThresholds: saved })
  })

  test('値を変えると有効になり、変えた項目だけが 0〜1 に変換されて送られる', () => {
    const form = botConfigurationForm({ ...base, drafts: { status: '82.5' } })
    expect(form.canSave).toBe(true)
    expect(form.errors).toEqual({})
    expect(form.request).toEqual({
      model: 'clef',
      thresholds: savedEvent,
      fieldThresholds: { ...saved, status: 0.825 }
    })
    const twoFields = botConfigurationForm({ ...base, drafts: { status: '90', start_date: '99.5' } })
    expect(twoFields.request).toEqual({
      model: 'clef',
      thresholds: savedEvent,
      fieldThresholds: { ...saved, status: 0.9, start_date: 0.995 }
    })
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
    expect(form.request).toEqual({ model: 'clef-flash', thresholds: savedEvent, fieldThresholds: saved })
    expect(botConfigurationForm({ ...base, selectedModel: 'clef' }).canSave).toBe(false)
  })

  test('モデルとしきい値の両方が変わっても、1回の保存で両方を送る', () => {
    const form = botConfigurationForm({ ...base, selectedModel: 'clef-flash', drafts: { status: '70' } })
    expect(form.canSave).toBe(true)
    expect(form.request).toEqual({
      model: 'clef-flash',
      thresholds: savedEvent,
      fieldThresholds: { ...saved, status: 0.7 }
    })
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
    const loading = botConfigurationForm({
      ...base,
      savedModel: undefined,
      savedEventThresholds: undefined,
      savedThresholds: undefined
    })
    expect(loading).toEqual({ errors: {}, request: null, canSave: false })
    expect(botConfigurationForm({ ...base, savedThresholds: undefined, drafts: { status: '70' } }).canSave).toBe(false)
    expect(botConfigurationForm({ ...base, savedModel: undefined, selectedModel: 'clef-flash' }).canSave).toBe(false)
    // 判定全体の3つが未取得のときも保存できない。
    expect(botConfigurationForm({ ...base, savedEventThresholds: undefined, drafts: { status: '70' } }).canSave).toBe(
      false
    )
  })

  test('送る body は12項目すべてを含み、既定値（status 0.8、店舗・娘 0.7）の設定でも欠けない', () => {
    const form = botConfigurationForm({
      ...base,
      savedThresholds: resolveFieldThresholds(0.9),
      drafts: { status: '70' }
    })
    if (form.request === null) throw new Error('Expected a request')
    expect(Object.keys(form.request.fieldThresholds).sort()).toEqual([...FIELD_THRESHOLD_KEYS].sort())
    expect(form.request.fieldThresholds.status).toBe(0.7)
    expect(form.request.fieldThresholds.store).toBe(0.7)
    expect(form.request.fieldThresholds.character_confirm).toBe(0.7)
    expect(AdminBotConfigurationRequestSchema.safeParse(form.request).success).toBe(true)
  })
})

describe('eventThresholdInputValue', () => {
  test('編集していない値は保存済みの値を%で、編集中の値は入力文字列をそのまま出す', () => {
    expect(eventThresholdInputValue(savedEvent, {}, 'eventThreshold')).toBe('90')
    expect(eventThresholdInputValue(savedEvent, {}, 'ignoreThreshold')).toBe('50')
    expect(eventThresholdInputValue(savedEvent, {}, 'choiceThreshold')).toBe('90')
    expect(eventThresholdInputValue(savedEvent, { eventThreshold: '9' }, 'eventThreshold')).toBe('9')
    expect(eventThresholdInputValue(savedEvent, { ignoreThreshold: '' }, 'ignoreThreshold')).toBe('')
    expect(eventThresholdInputValue(savedEvent, { eventThreshold: '9' }, 'choiceThreshold')).toBe('90')
  })
})

describe('botConfigurationForm: 判定全体の3つ', () => {
  test('変更が無ければ保存は無効で、送る thresholds は保存済みの値そのまま', () => {
    const form = botConfigurationForm(base)
    expect(form.canSave).toBe(false)
    expect(form.errors).toEqual({})
    expect(form.request?.thresholds).toEqual(savedEvent)
  })

  test('3つそれぞれの変更で保存が有効になり、変えた値だけが 0〜1 に変換されて送られる', () => {
    const cases = [
      ['eventThreshold', '85', { ...savedEvent, eventThreshold: 0.85 }],
      ['ignoreThreshold', '40', { ...savedEvent, ignoreThreshold: 0.4 }],
      ['choiceThreshold', '82.5', { ...savedEvent, choiceThreshold: 0.825 }]
    ] as const
    for (const [key, text, expected] of cases) {
      const form = botConfigurationForm({ ...base, drafts: { [key]: text } })
      expect(form.errors, key).toEqual({})
      expect(form.canSave, key).toBe(true)
      expect(form.request, key).toEqual({ model: 'clef', thresholds: expected, fieldThresholds: saved })
    }
  })

  test('編集していない値は保存値を変換せず送る（環境変数由来の小数も丸めない）', () => {
    const precise = { eventThreshold: 0.9123, ignoreThreshold: 0.4567, choiceThreshold: 0.8765 }
    const form = botConfigurationForm({ ...base, savedEventThresholds: precise, drafts: { choiceThreshold: '70' } })
    expect(form.request?.thresholds).toEqual({ ...precise, choiceThreshold: 0.7 })
    // 表示は丸めても、触っていなければ変更扱いにしない。
    expect(botConfigurationForm({ ...base, savedEventThresholds: precise }).canSave).toBe(false)
  })

  test('保存済みと同じ値を入力し直しても変更扱いにしない', () => {
    const form = botConfigurationForm({
      ...base,
      drafts: { eventThreshold: '90', ignoreThreshold: '50', choiceThreshold: '90.0' }
    })
    expect(form.canSave).toBe(false)
  })

  test('空・範囲外・数値以外は行ごとのエラーになり、保存は無効で body は作らない', () => {
    const cases: [string, string][] = [
      ['', THRESHOLD_EMPTY_ERROR],
      ['abc', THRESHOLD_RANGE_ERROR],
      ['0', THRESHOLD_RANGE_ERROR],
      ['100.1', THRESHOLD_RANGE_ERROR],
      ['82.55', THRESHOLD_RANGE_ERROR]
    ]
    for (const key of ['eventThreshold', 'choiceThreshold'] as const) {
      for (const [text, message] of cases) {
        const form = botConfigurationForm({ ...base, drafts: { [key]: text } })
        expect(form.errors, `${key} ${JSON.stringify(text)}`).toEqual({ [key]: message })
        expect(form.canSave, `${key} ${JSON.stringify(text)}`).toBe(false)
        expect(form.request, `${key} ${JSON.stringify(text)}`).toBeNull()
      }
    }
  })

  test('対象外の閾値は 0% を通し、空・範囲外は 0 始まりの文言のエラーにする', () => {
    const zero = botConfigurationForm({ ...base, drafts: { ignoreThreshold: '0' } })
    expect(zero.errors).toEqual({})
    expect(zero.canSave).toBe(true)
    expect(zero.request?.thresholds).toEqual({ ...savedEvent, ignoreThreshold: 0 })
    const empty = botConfigurationForm({ ...base, drafts: { ignoreThreshold: '' } })
    expect(empty.errors).toEqual({ ignoreThreshold: THRESHOLD_EMPTY_ERROR })
    expect(empty.request).toBeNull()
    for (const text of ['-1', '100.1', 'abc', '5.55']) {
      const form = botConfigurationForm({ ...base, drafts: { ignoreThreshold: text } })
      expect(form.errors, text).toEqual({ ignoreThreshold: IGNORE_THRESHOLD_RANGE_ERROR })
      expect(form.canSave, text).toBe(false)
      expect(form.request, text).toBeNull()
    }
  })

  test('対象外が登録以上なら対象外の欄にエラーを出して保存できない', () => {
    // 同じ値も不可（登録 90% に対して対象外 90%）。
    for (const text of ['90', '95', '100']) {
      const form = botConfigurationForm({ ...base, drafts: { ignoreThreshold: text } })
      expect(form.errors, text).toEqual({ ignoreThreshold: IGNORE_THRESHOLD_ORDER_ERROR })
      expect(form.canSave, text).toBe(false)
      expect(form.request, text).toBeNull()
    }
    expect(IGNORE_THRESHOLD_ORDER_ERROR).toBe('対象外判定の閾値は登録の閾値より小さくしてください。')
    // 直前まで有効な境界（89.9%）は保存できる。
    const edge = botConfigurationForm({ ...base, drafts: { ignoreThreshold: '89.9' } })
    expect(edge.errors).toEqual({})
    expect(edge.canSave).toBe(true)
  })

  test('登録を対象外以下まで下げても、エラーは対象外の欄に出る（下書き中の値を優先して比較）', () => {
    // 保存済みの対象外 50% に対して、登録だけを 40% に下げる。
    const lowered = botConfigurationForm({ ...base, drafts: { eventThreshold: '40' } })
    expect(lowered.errors).toEqual({ ignoreThreshold: IGNORE_THRESHOLD_ORDER_ERROR })
    expect(lowered.canSave).toBe(false)
    expect(lowered.request).toBeNull()
    // 両方を同時に直せば保存できる（登録 40%・対象外 30%）。
    const fixed = botConfigurationForm({ ...base, drafts: { eventThreshold: '40', ignoreThreshold: '30' } })
    expect(fixed.errors).toEqual({})
    expect(fixed.canSave).toBe(true)
    expect(fixed.request?.thresholds).toEqual({ ...savedEvent, eventThreshold: 0.4, ignoreThreshold: 0.3 })
    // 対象外を先に上げた下書き（登録 90% のまま 95%）が、登録も上げれば通る。
    const raised = botConfigurationForm({ ...base, drafts: { eventThreshold: '99', ignoreThreshold: '95' } })
    expect(raised.errors).toEqual({})
    expect(raised.canSave).toBe(true)
  })

  test('登録の入力が不正なときは、順序エラーを重ねずその欄のエラーだけを出す', () => {
    const form = botConfigurationForm({ ...base, drafts: { eventThreshold: 'abc' } })
    expect(form.errors).toEqual({ eventThreshold: THRESHOLD_RANGE_ERROR })
    expect(form.canSave).toBe(false)
    // 対象外が不正なら、その欄の範囲エラーを優先する。
    const both = botConfigurationForm({ ...base, drafts: { eventThreshold: '40', ignoreThreshold: 'x' } })
    expect(both.errors).toEqual({ ignoreThreshold: IGNORE_THRESHOLD_RANGE_ERROR })
  })

  test('3つと項目別とモデルを同時に変えても、1回の保存で全部を送る', () => {
    const form = botConfigurationForm({
      ...base,
      selectedModel: 'clef-flash',
      drafts: { eventThreshold: '95', choiceThreshold: '85', status: '70' }
    })
    expect(form.canSave).toBe(true)
    expect(form.request).toEqual({
      model: 'clef-flash',
      thresholds: { eventThreshold: 0.95, ignoreThreshold: 0.5, choiceThreshold: 0.85 },
      fieldThresholds: { ...saved, status: 0.7 }
    })
  })

  test('3つが正しくても項目別が不正なら、3つが不正でも項目別が正しければ、保存は無効', () => {
    const fieldBad = botConfigurationForm({ ...base, drafts: { eventThreshold: '95', category: '' } })
    expect(fieldBad.errors).toEqual({ category: THRESHOLD_EMPTY_ERROR })
    expect(fieldBad.canSave).toBe(false)
    const eventBad = botConfigurationForm({ ...base, drafts: { status: '70', choiceThreshold: '' } })
    expect(eventBad.errors).toEqual({ choiceThreshold: THRESHOLD_EMPTY_ERROR })
    expect(eventBad.canSave).toBe(false)
  })

  test('処理中は、3つを変えていても保存できない', () => {
    expect(botConfigurationForm({ ...base, drafts: { eventThreshold: '95' }, busy: true }).canSave).toBe(false)
  })
})
