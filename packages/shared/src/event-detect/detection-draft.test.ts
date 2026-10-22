import { describe, expect, test } from 'bun:test'
import type { ClefAnswer } from './clef'
import { buildDetectionDraft, DetectionDraftSchema, evaluateDetection } from './detection'
import { choice, post, requestWithAssociations, response, shintouAnswers, shintouPost } from './detection-test-fixtures'

describe('Detection draft', () => {
  test('カテゴリが僅差（0.45 / 0.43）の時はカテゴリを採用せず、タイトルを「店舗名 配布」にする', () => {
    // アクスタ・アクキーに言及する本文では category の選択肢が3つ残り、確率が割れうる。
    const split = { ...shintouPost, text: `${shintouPost.text}（アクスタ・アクキーではありません）` }
    const request = requestWithAssociations(split)
    const answers = shintouAnswers(request)
    const draft = buildDetectionDraft(split, answers)
    expect(draft).toEqual({
      title: 'ビックカメラ新宿東口駅前店 配布',
      stores: ['shintou'],
      characterIds: ['shintou'],
      startDate: '2026-10-19',
      conditions: [{ type: 'purchase', purchaseAmount: 1000 }],
      limitedQuantity: 100
    })
    expect(draft.category).toBeUndefined()
    expect(DetectionDraftSchema.safeParse(draft).success).toBe(true)
    // 同じ回答は登録候補にならず保留のまま。下書きは判定結果を変えない。
    expect(evaluateDetection(split, request, { answers })).toMatchObject({ status: 'held' })
  })
  test('カテゴリは最有力候補の確率が0.5以上の時だけ採用し、タイトルにカテゴリ名を含める', () => {
    const answers = shintouAnswers(requestWithAssociations(shintouPost))
    const draftOf = (probabilities: Record<string, number>, selected = 'other') =>
      buildDetectionDraft(shintouPost, { ...answers, category: choice(selected, probabilities) })
    expect(draftOf({ other: 0.62, acsta: 0.2 })).toMatchObject({
      category: 'other',
      title: 'ビックカメラ新宿東口駅前店 ノベルティ配布'
    })
    expect(draftOf({ acsta: 0.5, ackey: 0.3 }, 'acsta')).toMatchObject({
      category: 'acsta',
      title: 'ビックカメラ新宿東口駅前店 アクリルスタンド配布'
    })
    const justBelow = draftOf({ acsta: 0.4999, ackey: 0.3 }, 'acsta')
    expect(justBelow.category).toBeUndefined()
    expect(justBelow.title).toBe('ビックカメラ新宿東口駅前店 配布')
  })
  test('カテゴリがnoneの時はカテゴリを作らず、タイトルは「店舗名 配布」になる', () => {
    const request = requestWithAssociations(shintouPost)
    const draft = buildDetectionDraft(shintouPost, {
      ...shintouAnswers(request),
      category: choice('none', { none: 0.6 })
    })
    expect(draft.category).toBeUndefined()
    expect(draft.title).toBe('ビックカメラ新宿東口駅前店 配布')
    expect(draft.stores).toEqual(['shintou'])
  })
  test('回答が空・欠落・型違いでも投げず、取れない項目は空にする', () => {
    const empty = buildDetectionDraft(post(), {})
    expect(empty).toEqual({ stores: [], characterIds: [], conditions: [] })
    expect(DetectionDraftSchema.safeParse(empty).success).toBe(true)
    const wrongTypes = buildDetectionDraft(post(), {
      category: { type: 'noul', noul: 0.9 },
      store: { type: 'score', score: 1 },
      start_date: choice('none', { none: 1 }),
      end_date: choice('', { '': 1 }),
      condition: { type: 'noul', noul: 0.5 },
      quantity: choice('invented', { invented: 1 })
    })
    expect(wrongTypes).toEqual({ stores: [], characterIds: [], conditions: [] })
  })
  test('存在しない日付・0や過大な数量・不正な金額キーは下書きに入れない', () => {
    const draft = buildDetectionDraft(shintouPost, {
      ...shintouAnswers(requestWithAssociations(shintouPost)),
      start_date: choice('d20261399', { d20261399: 0.9 }),
      end_date: choice('d20260230', { d20260230: 0.9 }),
      purchase_amount: choice('p99999999999999999999', { p99999999999999999999: 0.9 }),
      quantity: choice('q0', { q0: 0.9 })
    })
    expect(draft.startDate).toBeUndefined()
    expect(draft.endDate).toBeUndefined()
    expect(draft.limitedQuantity).toBeUndefined()
    expect(draft.conditions).toEqual([])
    expect(DetectionDraftSchema.safeParse(draft).success).toBe(true)
  })
  test('配布条件ごとに先着・抽選へ数量を付け、全員配布は金額も数量も持たない', () => {
    const base = shintouAnswers(requestWithAssociations(shintouPost))
    const conditionsOf = (selected: string) =>
      buildDetectionDraft(shintouPost, { ...base, condition: choice(selected, { [selected]: 0.5 }) }).conditions
    expect(conditionsOf('purchase_first_come')).toEqual([
      { type: 'purchase', purchaseAmount: 1000 },
      { type: 'first_come', quantity: 100 }
    ])
    expect(conditionsOf('purchase_lottery')).toEqual([
      { type: 'purchase', purchaseAmount: 1000 },
      { type: 'lottery', quantity: 100 }
    ])
    expect(conditionsOf('first_come')).toEqual([{ type: 'first_come', quantity: 100 }])
    expect(conditionsOf('lottery')).toEqual([{ type: 'lottery', quantity: 100 }])
    expect(conditionsOf('everyone')).toEqual([{ type: 'everyone' }])
    expect(conditionsOf('none')).toEqual([])
  })
})

describe('End date none confirmation', () => {
  // 新東たんの実投稿に近い入力。本文に店舗名・「ビッカメ娘」は無く、終了日は「なくなり次第終了」。
  const value = post(
    '🎃新東たん擬人化６周年イベント🎃\n日付：10月19日（月）～なくなり次第終了\n枚数：限定60枚\n※5,000円以上お買い物でお一人様一枚まで\nアクリルコースタープレゼント🎁',
    { screenName: 'Bic_shintoueki', createdAt: '2026-10-16T01:00:00.000Z' }
  )
  const request = requestWithAssociations(value)
  const answersOf = (endDate: ClefAnswer) =>
    response(request, {
      is_event: { type: 'noul', noul: 0.95 },
      category: choice('other', { other: 0.99 }),
      start_date: choice('d20261019', { d20261019: 0.99 }),
      end_date: endDate,
      condition: choice('purchase', { purchase: 0.99 }),
      purchase_amount: choice('p5000', { p5000: 0.99 }),
      quantity: choice('q60', { q60: 0.99 })
    })

  test('最有力が none（0.7348）ならしきい値未満でも終了日なしで確定し、end_date_unconfirmed を付けずに登録する', () => {
    const result = evaluateDetection(value, request, answersOf(choice('none', { none: 0.7348, d20261019: 0.2652 })))
    expect(result.status).toBe('register')
    expect(result.reasons).not.toContain('end_date_unconfirmed')
    expect(result.reasons).toEqual([])
    if (result.status !== 'register') throw new Error('Expected candidate')
    expect(result.candidate).not.toHaveProperty('endDate')
    expect(result.candidate.limitedQuantity).toBe(60)
  })

  test('none が過半数に届かなくても、最有力ならしきい値未満で確定する', () => {
    const result = evaluateDetection(value, request, answersOf(choice('none', { none: 0.4, d20261019: 0.35 })))
    expect(result.status).toBe('register')
    expect(result.reasons).not.toContain('end_date_unconfirmed')
  })

  test('最有力が日付で確率がしきい値未満（0.6）なら従来どおり end_date_unconfirmed で保留する', () => {
    const result = evaluateDetection(value, request, answersOf(choice('d20261019', { d20261019: 0.6, none: 0.3 })))
    expect(result).toMatchObject({ status: 'held', reasons: ['end_date_unconfirmed'] })
  })

  test('最有力が日付でしきい値以上（0.95）なら終了日が入る', () => {
    const result = evaluateDetection(value, request, answersOf(choice('d20261019', { d20261019: 0.95, none: 0.04 })))
    expect(result.status).toBe('register')
    if (result.status !== 'register') throw new Error('Expected candidate')
    expect(result.candidate.endDate).toBe('2026-10-19')
  })

  test('下書きは最有力が none なら終了日を入れず、判定とは独立に動く', () => {
    const answers = answersOf(choice('none', { none: 0.7348, d20261019: 0.2652 })).answers
    const draft = buildDetectionDraft(value, answers)
    expect(draft.endDate).toBeUndefined()
    expect(draft.startDate).toBe('2026-10-19')
    expect(DetectionDraftSchema.safeParse(draft).success).toBe(true)
  })
})
