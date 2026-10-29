import { describe, expect, test } from 'bun:test'
import { judgmentReasons, reasonLabel } from './answer-view'

// 継続・終了と判定された投稿の旧ジョブは、保存済みの理由に新規登録向けの理由（開始日・配布条件・金額など）がすでに入っている。
// 再実行しないと保存は変わらないので、画面の判定理由の行（judgmentReasons）では表示から除く。保存する値は変えない。

const NEW_EVENT_ONLY = [
  'start_date_unspecified',
  'start_date_unconfirmed',
  'end_date_unconfirmed',
  'invalid_date_range',
  'distribution_condition_unspecified',
  'distribution_condition_unconfirmed',
  'purchase_amount_unconfirmed',
  'charge_amount_unconfirmed',
  'unmodeled_distribution_condition'
]
const STATUS_REASONS = ['existing_event_update', 'event_ended']

describe('judgmentReasons: 継続・終了の旧ジョブ', () => {
  test('終了の旧ジョブから、初回開始日が未記載などの新規登録向けの理由を除く', () => {
    expect(judgmentReasons(['event_ended', 'start_date_unspecified'])).toEqual(['event_ended'])
    expect(judgmentReasons(['start_date_unspecified', 'event_ended'])).toEqual(['event_ended'])
  })

  test('継続の旧ジョブからも除く', () => {
    expect(judgmentReasons(['existing_event_update', 'start_date_unconfirmed', 'end_date_unconfirmed'])).toEqual([
      'existing_event_update'
    ])
  })

  test('新規登録向けの理由は、状態の理由と並べて全て除く（どの組み合わせでも状態の理由が残る）', () => {
    for (const status of STATUS_REASONS) {
      expect(judgmentReasons([status, ...NEW_EVENT_ONLY]), status).toEqual([status])
      for (const reason of NEW_EVENT_ONLY)
        expect(judgmentReasons([reason, status]), `${status} ${reason}`).toEqual([status])
    }
  })

  test('状態の理由は必ず残るので、理由が空にはならない', () => {
    for (const status of STATUS_REASONS)
      expect(judgmentReasons([status, ...NEW_EVENT_ONLY]).length, status).toBeGreaterThan(0)
  })

  test('店舗・娘・配布物の理由は残す（どのイベントのことかを決める情報）', () => {
    const kept = [
      'store_unconfirmed',
      'store_mismatch',
      'store_confirm_low',
      'character_unconfirmed',
      'character_confirm_low',
      'distribution_item_unspecified',
      'category_unconfirmed'
    ]
    expect(judgmentReasons(['event_ended', 'start_date_unspecified', ...kept])).toEqual(['event_ended', ...kept])
  })

  test('重複の可能性・未知のコード・`<code>:<id>` の形は残す', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000'
    expect(
      judgmentReasons([
        'existing_event_update',
        'purchase_amount_unconfirmed',
        `possible_duplicate:${id}`,
        'future_reason'
      ])
    ).toEqual(['existing_event_update', `possible_duplicate:${id}`, 'future_reason'])
  })

  test('既存の除外（情報用のコード・総括）と併用できる', () => {
    expect(
      judgmentReasons([
        'title_generated',
        'event_ended',
        'start_date_unspecified',
        'auto_registration_not_allowed',
        'store_inferred_from_account'
      ])
    ).toEqual(['event_ended'])
    // 総括だけが残るのは、ほかに表示できる理由が無いときだけ（状態の理由があれば総括は出ない）。
    expect(
      judgmentReasons(['auto_registration_not_allowed', 'existing_event_update', 'unmodeled_distribution_condition'])
    ).toEqual(['existing_event_update'])
  })

  test('保存された配列を書き換えない', () => {
    const stored = ['event_ended', 'start_date_unspecified', 'title_generated']
    const snapshot = [...stored]
    const shown = judgmentReasons(stored)
    expect(stored).toEqual(snapshot)
    expect(shown).not.toBe(stored)
  })
})

describe('judgmentReasons: 告知・開始・状態が確定しない旧ジョブ', () => {
  test('新規登録向けの理由は除かない（本当に新規告知で日付や条件が足りない可能性がある）', () => {
    expect(judgmentReasons(['start_date_unspecified', 'distribution_condition_unspecified'])).toEqual([
      'start_date_unspecified',
      'distribution_condition_unspecified'
    ])
    expect(judgmentReasons(NEW_EVENT_ONLY)).toEqual(NEW_EVENT_ONLY)
  })

  test('状態が確定しない（status_unconfirmed）旧ジョブも除かない', () => {
    expect(judgmentReasons(['status_unconfirmed', 'start_date_unspecified', 'purchase_amount_unconfirmed'])).toEqual([
      'status_unconfirmed',
      'start_date_unspecified',
      'purchase_amount_unconfirmed'
    ])
  })

  test('告知の保留規則の理由も除かない', () => {
    const reasons = ['start_date_unconfirmed', 'condition_pattern_unconfirmed', 'extraction_store_unspecified']
    expect(judgmentReasons(reasons)).toEqual(reasons)
  })
})

describe('画面の文言', () => {
  test('終了の旧ジョブの判定理由に「初回開始日が未記載」は出ない', () => {
    const labels = judgmentReasons(['event_ended', 'start_date_unspecified']).map(reasonLabel)
    expect(labels).toEqual(['既存企画の終了情報'])
    expect(labels).not.toContain('初回開始日が未記載')
  })
})
