import { describe, expect, test } from 'bun:test'
import { LINKED_EVENT_THRESHOLD } from './linked-event'
import { autoLinkKind, autoLinkThreshold } from './linked-event-auto'

describe('autoLinkThreshold', () => {
  test('選択肢項目の共通のしきい値（既定 0.9）と提案の下限（0.7）の大きい方', () => {
    expect(LINKED_EVENT_THRESHOLD).toBe(0.7)
    expect(autoLinkThreshold(0.9)).toBe(0.9)
    expect(autoLinkThreshold(0.97)).toBe(0.97)
    // 管理画面でしきい値を下げても、提案の下限より低くは連携しない。
    expect(autoLinkThreshold(0.5)).toBe(0.7)
    expect(autoLinkThreshold(0.7)).toBe(0.7)
  })
})

describe('autoLinkKind', () => {
  test('保留の理由が状態だけなら、終了は ended、継続は ongoing', () => {
    expect(autoLinkKind(['event_ended'])).toBe('ended')
    expect(autoLinkKind(['existing_event_update'])).toBe('ongoing')
    expect(autoLinkKind(['event_ended', 'event_ended'])).toBe('ended')
  })

  test('title_generated / title_fallback は情報用の理由なので数えない', () => {
    expect(autoLinkKind(['event_ended', 'title_generated'])).toBe('ended')
    expect(autoLinkKind(['title_fallback', 'existing_event_update'])).toBe('ongoing')
    expect(autoLinkKind(['title_generated', 'title_fallback', 'event_ended'])).toBe('ended')
  })

  test.each([
    ['理由なし', []],
    ['情報用の理由だけ', ['title_generated']],
    ['状態が確定しない', ['status_unconfirmed']],
    ['終了と継続の併記', ['event_ended', 'existing_event_update']],
    ['店舗が未確定', ['event_ended', 'store_unconfirmed']],
    ['店舗の不一致', ['existing_event_update', 'store_mismatch']],
    ['娘が未確定', ['event_ended', 'character_unconfirmed']],
    ['配布物が未確定', ['existing_event_update', 'category_unconfirmed']],
    ['配布物が未指定', ['event_ended', 'distribution_item_unspecified']],
    ['重複の可能性（イベント）', ['event_ended', 'possible_duplicate:550e8400-e29b-41d4-a716-446655440000']],
    ['重複の可能性（投稿）', ['existing_event_update', 'possible_duplicate_post:2112378276735760001']],
    ['店舗を投稿アカウントから補完', ['event_ended', 'store_inferred_from_account']],
    ['自動登録の条件を満たさない', ['event_ended', 'auto_registration_not_allowed']]
  ])('状態以外の理由が 1 つでもあれば人が見る: %s', (_name, reasons) => {
    expect(autoLinkKind(reasons)).toBeNull()
  })
})
