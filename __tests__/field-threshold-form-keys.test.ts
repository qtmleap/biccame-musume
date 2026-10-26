import { describe, expect, test } from 'bun:test'
import { answerQuestionKeys } from '@biccame/shared/event-detect/answer-view'
import { FIELD_THRESHOLD_KEYS, type FieldThresholds } from '@biccame/shared/event-detect/detection'
import { AdminBotConfigurationRequestSchema, type EventThresholds } from '@biccame/shared/schemas/admin-bot.dto'
import {
  botConfigurationForm,
  EDITABLE_FIELD_THRESHOLD_KEYS,
  fieldThresholdInputValue,
  THRESHOLD_EMPTY_ERROR,
  THRESHOLD_RANGE_ERROR,
  thresholdToPercentText
} from '@/components/admin/field-threshold-form'

// 項目別のしきい値 12 項目の編集（入力・変更検知・保存可否・エラー・保存リクエストの形）。field-threshold-form.test.ts から分けた。
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
const savedEvent: EventThresholds = { eventThreshold: 0.9, ignoreThreshold: 0.5, choiceThreshold: 0.9 }
const base = {
  savedModel: 'clef',
  selectedModel: null,
  savedEventThresholds: savedEvent,
  savedThresholds: saved,
  drafts: {},
  busy: false
} as const

describe('店舗・娘とその確認、入金・チャージ額も、他の項目と同じ扱いで編集できる', () => {
  const added = ['store', 'store_confirm', 'character', 'character_confirm', 'charge_amount'] as const

  test('編集できる項目は保存・状態の12キーと同じで、回答表の質問の順', () => {
    expect([...EDITABLE_FIELD_THRESHOLD_KEYS]).toEqual([...FIELD_THRESHOLD_KEYS])
    expect([...EDITABLE_FIELD_THRESHOLD_KEYS]).toEqual([
      'status',
      'category',
      'store',
      'store_confirm',
      'character',
      'character_confirm',
      'start_date',
      'end_date',
      'quantity',
      'condition',
      'purchase_amount',
      'charge_amount'
    ])
  })

  test('回答表に出る質問（is_event と廃止した single_event を除く）は、すべて編集できる項目に入っている（抜けを検知する）', () => {
    const questionKeys = [...answerQuestionKeys()].filter((key) => key !== 'is_event' && key !== 'single_event')
    expect(questionKeys.length).toBeGreaterThan(0)
    for (const key of questionKeys)
      expect(
        FIELD_THRESHOLD_KEYS.some((value) => value === key),
        key
      ).toBe(true)
    // 逆に、編集できる項目はすべて回答表の質問でもある。
    for (const key of FIELD_THRESHOLD_KEYS) expect(questionKeys.includes(key), key).toBe(true)
  })

  for (const key of added) {
    test(`${key} は入力・変更検知・保存可否・エラーが他の項目と同じ`, () => {
      const form = botConfigurationForm({ ...base, drafts: { [key]: '55.5' } })
      expect(form.canSave).toBe(true)
      expect(form.errors).toEqual({})
      expect(form.request?.fieldThresholds).toEqual({ ...saved, [key]: 0.555 })
      // 保存済みと同じ値を入力し直しても変更扱いにしない。
      expect(botConfigurationForm({ ...base, drafts: { [key]: thresholdToPercentText(saved[key]) } }).canSave).toBe(
        false
      )
      // 不正な入力は行ごとのエラーになり、保存できない。
      for (const text of ['', 'abc', '0', '100.1']) {
        const invalid = botConfigurationForm({ ...base, drafts: { [key]: text } })
        expect(invalid.errors[key], `${key} ${JSON.stringify(text)}`).toBe(
          text === '' ? THRESHOLD_EMPTY_ERROR : THRESHOLD_RANGE_ERROR
        )
        expect(invalid.canSave).toBe(false)
        expect(invalid.request).toBeNull()
      }
      expect(fieldThresholdInputValue(saved, {}, key)).toBe(thresholdToPercentText(saved[key]))
      expect(fieldThresholdInputValue(saved, { [key]: '12' }, key)).toBe('12')
    })
  }

  test('保存リクエストは全12キー。古いクライアントの8キーのリクエストも API のスキーマを通る（新しい4項目は任意）', () => {
    const form = botConfigurationForm({ ...base, drafts: { store: '85' } })
    expect(AdminBotConfigurationRequestSchema.safeParse(form.request).success).toBe(true)
    const { store_confirm: _a, character: _b, character_confirm: _c, charge_amount: _d, ...legacy } = saved
    const oldClient = { model: 'clef', thresholds: savedEvent, fieldThresholds: legacy }
    expect(AdminBotConfigurationRequestSchema.safeParse(oldClient).success).toBe(true)
    // 余分なキーや旧 8 項目の欠けは不正のまま。
    expect(
      AdminBotConfigurationRequestSchema.safeParse({ ...oldClient, fieldThresholds: { ...legacy, extra: 0.5 } }).success
    ).toBe(false)
    const { status: _status, ...withoutStatus } = legacy
    expect(AdminBotConfigurationRequestSchema.safeParse({ ...oldClient, fieldThresholds: withoutStatus }).success).toBe(
      false
    )
  })
})
