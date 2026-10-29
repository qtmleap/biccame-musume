import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { judgmentReasons, reasonLabel } from './answer-view'
import { choice } from './answer-view-test-fixtures'
import { createConfirmRequest } from './association-confirm'
import type { ClefAnswer, ClefRequest } from './clef'
import { createDetectionRequest } from './detection'
import { ConditionSchema } from './detection-schemas'
import { evaluateWithStore } from './detection-test-fixtures'
import { DROP_REASONS } from './filter'
import type { DetectPost } from './post'

describe('reasonLabel', () => {
  // evaluateDetection・filter・webhook-process・webhook-admin が出す全ての理由コードと、その日本語。
  const labels: Record<string, string> = {
    event_confidence_below_threshold: 'ビッカメ娘のイベントと確信できない',
    not_new_event_announcement: '新規の告知ではない',
    status_unconfirmed: '告知・継続・終了の状態を確定できない',
    existing_event_update: '既存企画の継続・更新情報',
    event_ended: '既存企画の終了情報',
    distribution_item_unspecified: '対象物が未記載・未発表',
    start_date_unspecified: '初回開始日が未記載',
    distribution_condition_unspecified: '入手条件が未記載・未発表',
    charge_amount_unconfirmed: '入金・チャージ額を確定できない',
    category_unconfirmed: '配布物を確定できない',
    store_unconfirmed: '開催店舗を確定できない',
    store_mismatch: '抽出した開催店舗と判定した店舗が一致しない',
    character_unconfirmed: '対象ビッカメ娘を確定できない',
    store_confirm_low: '開催店舗の確認の確率がしきい値未満',
    character_confirm_low: '対象ビッカメ娘の確認の確率がしきい値未満',
    store_inferred_from_account: '店舗は投稿アカウントから補完',
    title_generated: 'タイトルは AI が作成',
    title_fallback: 'タイトルは定型（AI の作成に失敗）',
    start_date_unconfirmed: '開始日を確定できない',
    end_date_unconfirmed: '終了日を確定できない',
    purchase_amount_unconfirmed: '購入額を確定できない',
    multiple_or_ambiguous_events: '複数または曖昧なイベント',
    multiple_or_ambiguous_stores: '複数または曖昧な店舗',
    distribution_condition_unconfirmed: '配布条件を確定できない',
    quantity_unconfirmed: '配布数を確定できない',
    invalid_date_range: '期間が不正',
    unmodeled_distribution_condition: '未対応の配布条件',
    condition_pattern_unconfirmed: '配布条件の組み合わせが自動登録の対象外',
    charge_condition_unconfirmed: '入金・チャージ条件は自動登録の対象外',
    extraction_store_unspecified: '抽出段階で開催店舗を特定できていない',
    invalid_event_candidate: '登録候補が不正',
    auto_registration_not_allowed: '自動登録の条件を満たさない',
    not_distribution_event: 'ビッカメ娘のイベントではない',
    no_keyword: 'キーワードなし',
    non_store_account: '店舗以外のアカウント',
    retweet: 'RT',
    reply_to_other: '他者宛てリプライ',
    excluded_keyword: '除外語',
    manually_linked: '手動で紐付け',
    manually_rejected: '手動で却下'
  }

  test.each(Object.entries(labels))('%s は日本語ラベルを持つ', (code, label) => {
    expect(reasonLabel(code)).toBe(label)
  })

  test('重複の可能性はコロン前のコードで引き、IDは含めない', () => {
    expect(reasonLabel('possible_duplicate:550e8400-e29b-41d4-a716-446655440000')).toBe('重複の可能性あり')
    expect(reasonLabel('possible_duplicate_post:2109841560305361272')).toBe('重複の可能性あり')
  })

  test('未知のコードと未知の接頭辞はそのまま返す', () => {
    expect(reasonLabel('future_reason')).toBe('future_reason')
    expect(reasonLabel('future_reason:abc')).toBe('future_reason:abc')
    expect(reasonLabel('')).toBe('')
    expect(reasonLabel('合成データ：配布条件を管理者が確認してください')).toBe(
      '合成データ：配布条件を管理者が確認してください'
    )
  })

  test('除外理由は filter の DROP_REASONS を全て網羅する', () => {
    for (const code of DROP_REASONS) expect(reasonLabel(code), code).not.toBe(code)
  })

  test('detection.ts のソースに現れる理由コードの全てにラベルがある（理由を足してラベルを忘れない）', () => {
    const source = readFileSync(resolve(import.meta.dirname, 'detection.ts'), 'utf8')
    const conditionTypes = new Set<string>(ConditionSchema.shape.type.options)
    const codes = [...source.matchAll(/(?:\['|[?:=]\s*')([a-z]+(?:_[a-z]+)+)'/g)]
      .map((match) => match[1])
      .filter((code) => !conditionTypes.has(code))
    expect(codes.length).toBeGreaterThanOrEqual(14)
    for (const code of codes) expect(reasonLabel(code), code).not.toBe(code)
  })

  test('evaluateDetection が実際に返す全ての理由に、対応表のラベルがある', () => {
    const post = (text: string, overrides: Partial<DetectPost> = {}): DetectPost => ({
      id: '2109221721773576390',
      createdAt: '2026-10-11T01:00:00.000Z',
      screenName: 'bic_abeno',
      kind: 'original',
      text,
      url: 'https://x.com/bic_abeno/status/2109221721773576390',
      media: [],
      ...overrides
    })
    const answersFor = (request: ClefRequest, overrides: Record<string, ClefAnswer> = {}) => {
      const answers = Object.fromEntries(
        Object.entries(request.questions).map(([key, question]): [string, ClefAnswer] => {
          if (question.type === 'noul') return [key, { type: 'noul', noul: 0.99 }]
          // 店舗とビッカメ娘は選ばれている前提にし、他の項目は「わからない」にする（両方 none だと対象外になり、他の理由が出ない）。
          if (key === 'store' || key === 'character') return [key, choice('abeno', { abeno: 0.99 })]
          return [key, choice('none', { none: 0.99 })]
        })
      )
      return { answers: { ...answers, ...overrides } }
    }
    const seen = new Set<string>()
    const collect = (
      value: DetectPost,
      overrides: Record<string, ClefAnswer> = {},
      event = 0.99,
      storeKey: string | null = null
    ) => {
      const request = createDetectionRequest(value)
      const result = evaluateWithStore(
        value,
        request,
        answersFor(request, { is_event: { type: 'noul', noul: event }, ...overrides }),
        undefined,
        storeKey
      )
      for (const reason of result.reasons) seen.add(reason)
    }
    // 全項目が「わからない」の保留、会員条件、複数店舗、逆転した期間、購入額・数量・終了日の未確定、対象外、除外。
    collect(post('あべのたん限定名刺 2026年11月3日から先着100枚'))
    collect(post('あべのたん限定名刺 2026年11月3日から会員カード提示で先着100枚'), {}, 0.7)
    collect(post('あべのたん・アキバたん 限定名刺 2026年11月3日から1,000円以上お買い上げの方先着100枚'), {
      single_event: { type: 'noul', noul: 0.2 },
      condition: choice('purchase_first_come', { purchase_first_come: 0.5, none: 0.4 }),
      end_date: choice('d20261103', { d20261103: 0.5, none: 0.4 }),
      quantity: choice('q100', { q100: 0.5, none: 0.4 })
    })
    collect(post('あべのたん限定名刺 2026年11月3日から11月2日まで1,000円以上お買い上げの方先着100枚'), {
      start_date: choice('d20261103', { d20261103: 0.99 }),
      end_date: choice('d20261102', { d20261102: 0.99 }),
      condition: choice('purchase_first_come', { purchase_first_come: 0.99 })
    })
    // 新規の告知で配布条件が先着だけ・入金条件・抽出段階の店舗候補なし（保留規則）。
    const announced = {
      status: choice('announce', { announce: 0.99 }),
      category: choice('limited_card', { limited_card: 0.99 }),
      start_date: choice('d20261103', { d20261103: 0.99 })
    }
    collect(post('あべのたん限定名刺 2026年11月3日から先着100枚'), {
      ...announced,
      condition: choice('first_come', { first_come: 0.99 }),
      quantity: choice('q100', { q100: 0.99 })
    })
    collect(post('あべのたん限定名刺 2026年11月3日から1,000円以上入金で先着100枚'), {
      ...announced,
      condition: choice('charge_first_come', { charge_first_come: 0.99 }),
      charge_amount: choice('p1000', { p1000: 0.99 }),
      quantity: choice('q100', { q100: 0.99 })
    })
    // is_event は参考値なので、低くても店舗とビッカメ娘が取れていれば理由は増えない。
    collect(post('あべのたん限定名刺 2026年11月3日から先着100枚'), {}, 0.1)
    // 店舗とビッカメ娘の両方が none なら対象外、片方だけ none・複数なら保留、抽出段階の店舗候補と食い違えば確認。
    const none = choice('none', { none: 0.99 })
    collect(post('あべのたん限定名刺 2026年11月3日から先着100枚'), { store: none, character: none })
    collect(post('あべのたん限定名刺 2026年11月3日から先着100枚'), { store: none })
    collect(post('あべのたん限定名刺 2026年11月3日から先着100枚'), {
      character: choice('multiple', { multiple: 0.99 })
    })
    collect(post('あべのたん限定名刺 2026年11月3日から先着100枚'), {}, 0.99, 'akiba')
    // 2段目の確認の質問を含む request で、1段目の最上位が 70% 未満で確認の「はい」が低いとき（v16）。
    {
      const value = post('あべのたん限定名刺 2026年11月3日から先着100枚')
      const request = createDetectionRequest(value)
      const merged: ClefRequest = {
        ...request,
        questions: {
          ...request.questions,
          ...createConfirmRequest(request, { store: 'abeno', character: 'abeno' }).questions
        }
      }
      const result = evaluateWithStore(
        value,
        merged,
        answersFor(merged, {
          store: choice('abeno', { abeno: 0.6 }),
          character: choice('abeno', { abeno: 0.6 }),
          store_confirm: { type: 'noul', noul: 0.1 },
          character_confirm: { type: 'noul', noul: 0.1 }
        })
      )
      for (const reason of result.reasons) seen.add(reason)
    }
    collect(post('あべのたん限定名刺 2026年11月3日から先着100枚'), {
      category: choice('limited_card', { limited_card: 0.5, none: 0.4 }),
      start_date: choice('d20261103', { d20261103: 0.5, none: 0.4 })
    })
    for (const status of ['ongoing', 'end'])
      collect(post('あべのたん名刺 11/3から先着100枚'), {
        status: choice(status, { [status]: 0.99 })
      })
    collect(post('あべのたん名刺配布'))
    collect(post('日常のあいさつです'))
    collect(post('あべのたん限定名刺 2026年11月3日から先着100枚', { kind: 'retweet' }))
    collect(post('あべのたん限定名刺 2026年11月3日から先着100枚', { screenName: 'untrusted' }))
    collect(post('あべのたん限定名刺 2026年11月3日から先着100枚', { replyTo: { id: '1', screenName: 'someone_else' } }))
    collect(post('PCのキャンペーン終了', { screenName: 'bicpkanhonten' }))
    // タイトルの理由は webhook-process.ts が付ける（evaluateDetection は出さない）。
    for (const reason of [
      'invalid_event_candidate',
      'manually_linked',
      'manually_rejected',
      'title_generated',
      'title_fallback'
    ])
      seen.add(reason)
    // 上の入力で evaluateDetection の全ての理由を実際に出させたことを確かめる。
    for (const reason of [
      'unmodeled_distribution_condition',
      'status_unconfirmed',
      'existing_event_update',
      'event_ended',
      'distribution_item_unspecified',
      'start_date_unspecified',
      'distribution_condition_unspecified',
      'category_unconfirmed',
      'store_unconfirmed',
      'store_mismatch',
      'character_unconfirmed',
      'store_confirm_low',
      'character_confirm_low',
      'start_date_unconfirmed',
      'end_date_unconfirmed',
      'invalid_date_range',
      'distribution_condition_unconfirmed',
      'purchase_amount_unconfirmed',
      'condition_pattern_unconfirmed',
      'charge_condition_unconfirmed',
      'extraction_store_unspecified',
      'not_distribution_event',
      ...DROP_REASONS
    ])
      expect(seen.has(reason), `${reason} を出す入力がない`).toBe(true)
    for (const reason of seen) {
      expect(Object.hasOwn(labels, reason), `${reason} がテストの対応表にない`).toBe(true)
      expect(reasonLabel(reason), reason).toBe(labels[reason])
    }
  })
})

describe('judgmentReasons', () => {
  // 画面には出さない情報用のコード
  const notes = ['store_inferred_from_account', 'title_generated', 'title_fallback']

  test('空配列は空になる', () => {
    expect(judgmentReasons([])).toEqual([])
  })

  test('情報用コードだけなら、全て除かれて空になる', () => {
    expect(judgmentReasons(notes)).toEqual([])
  })

  test('情報用コードは3つとも除かれる', () => {
    for (const code of notes) expect(judgmentReasons([code]), code).toEqual([])
  })

  test('判定の理由だけなら、全て元の並びのまま残る', () => {
    const reasons = ['store_unconfirmed', 'manually_linked', 'possible_duplicate:550e8400-e29b-41d4-a716-446655440000']
    expect(judgmentReasons(reasons)).toEqual(reasons)
  })

  test('混在していても、情報用コードだけを除いて元の並びを保つ', () => {
    expect(
      judgmentReasons([
        'title_generated',
        'manually_linked',
        'store_inferred_from_account',
        'store_unconfirmed',
        'title_fallback'
      ])
    ).toEqual(['manually_linked', 'store_unconfirmed'])
  })

  test('未知のコードは残る', () => {
    expect(judgmentReasons(['future_reason', 'title_generated', 'future_reason:abc'])).toEqual([
      'future_reason',
      'future_reason:abc'
    ])
  })

  test('除かれるコードは全てラベルを持つ（除外とラベルが食い違わない）', () => {
    for (const code of notes) expect(reasonLabel(code), code).not.toBe(code)
  })

  test('入力の配列は書き換えない', () => {
    const reasons = ['title_generated', 'manually_linked']
    judgmentReasons(reasons)
    expect(reasons).toEqual(['title_generated', 'manually_linked'])
  })

  describe('auto_registration_not_allowed（自動登録できなかったことだけを示す総括のコード）', () => {
    const generic = 'auto_registration_not_allowed'

    test('具体的な理由が併記されるときは、具体的な理由だけを元の並びで残す', () => {
      expect(judgmentReasons([generic, 'distribution_item_count_mismatch'])).toEqual([
        'distribution_item_count_mismatch'
      ])
      expect(
        judgmentReasons(['store_unconfirmed', generic, 'possible_duplicate:550e8400-e29b-41d4-a716-446655440000'])
      ).toEqual(['store_unconfirmed', 'possible_duplicate:550e8400-e29b-41d4-a716-446655440000'])
      expect(judgmentReasons([generic, 'future_reason'])).toEqual(['future_reason'])
    })

    test('唯一の理由なら残すので、保留なのに理由が無いようには見えない', () => {
      expect(judgmentReasons([generic])).toEqual([generic])
      expect(reasonLabel(generic)).toBe('自動登録の条件を満たさない')
    })

    test('情報用のコードと併せても同じ（具体的な理由があれば除き、無ければ残す）', () => {
      expect(judgmentReasons([generic, 'title_generated'])).toEqual([generic])
      expect(judgmentReasons(['store_inferred_from_account', generic, 'title_fallback'])).toEqual([generic])
      expect(judgmentReasons([generic, 'title_generated', 'distribution_item_count_unknown'])).toEqual([
        'distribution_item_count_unknown'
      ])
    })

    test('保存された配列は書き換えない（表示の絞り込みだけで、保存する値は変わらない）', () => {
      const reasons = Object.freeze([generic, 'title_generated', 'store_unconfirmed'])
      expect(judgmentReasons(reasons)).toEqual(['store_unconfirmed'])
      expect(reasons).toEqual([generic, 'title_generated', 'store_unconfirmed'])
    })
  })
})
