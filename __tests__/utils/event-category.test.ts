import { describe, expect, test } from 'bun:test'
import { EVENT_CATEGORY_LABELS } from '../../workers/app/src/locales/app.content'
import { EventCategorySchema } from '../../workers/app/src/schemas/event.dto'
import {
  DEFAULT_EVENT_CATEGORY,
  DEFAULT_EVENT_LIST_FILTERS,
  EventSearchSchema
} from '../../workers/app/src/schemas/event-search'

describe('イベントのカテゴリ', () => {
  test('アクスタはアクキーの次、その他の前に並ぶ', () => {
    expect(EventCategorySchema.options).toEqual(['limited_card', 'regular_card', 'ackey', 'acsta', 'other'])
  })

  test('スキーマはアクスタを受け付ける', () => {
    expect(EventCategorySchema.safeParse('acsta').success).toBe(true)
    expect(EventCategorySchema.safeParse('acrylic_stand').success).toBe(false)
  })

  test('表示名はアクスタで、全カテゴリに表示名がある', () => {
    expect(EVENT_CATEGORY_LABELS.acsta).toBe('アクスタ')
    for (const category of EventCategorySchema.options) {
      expect(EVENT_CATEGORY_LABELS[category]).toBeTruthy()
    }
  })

  test('公開一覧の絞り込みは既定でアクスタも含み、URL の acsta を受け付ける', () => {
    expect(DEFAULT_EVENT_CATEGORY.split(',')).toContain('acsta')
    const selected = EventSearchSchema.safeParse({ category: 'acsta' })
    const unset = EventSearchSchema.safeParse({})
    expect(selected.success && selected.data.category).toBe('acsta')
    // 省略は undefined のまま。既定(全カテゴリ)は合成側で入れる。
    expect(unset.success && unset.data.category).toBeUndefined()
    expect(DEFAULT_EVENT_LIST_FILTERS.category).toBe(DEFAULT_EVENT_CATEGORY)
  })
})
