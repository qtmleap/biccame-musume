import { describe, expect, test } from 'bun:test'
import { WebhookDiscoverySchema } from '../schemas/webhook-discovery.dto'
import { createConfirmRequest } from './association-confirm'
import { storeShortName } from './association-questions'
import { detectionStores } from './associations'
import { type ClefAnswer, type ClefQuestion, type ClefRequest, ClefRequestSchema, type ClefResponse } from './clef'
import { DEFAULT_DETECTION_THRESHOLDS, describeDetectionOutcome, evaluateDetection } from './detection'
import { decideAssociations } from './detection-association'
import * as fixtures from './detection-test-fixtures'
import { post, requestWithAssociations } from './detection-test-fixtures'
import {
  createLinkedEventRequest,
  isLinkedEventQuestion,
  LINKED_EVENT_INSTRUCTIONS,
  LINKED_EVENT_MAX_OPTIONS,
  LINKED_EVENT_NONE,
  LINKED_EVENT_QUESTION_KEY,
  LINKED_EVENT_THRESHOLD,
  type LinkableEvent,
  linkedEventDescription,
  linkedEventOptions,
  linkedEventProposalOf,
  linkedEventQuestion,
  linkedEventStore,
  linkedEventTargetStore,
  postAccountStore
} from './linked-event'

const KEY = /^[A-Za-z0-9_.-]{1,100}$/
const uuid = (index: number) => `550e8400-e29b-41d4-a716-${String(index).padStart(12, '0')}`
const event = (index: number, overrides: Partial<LinkableEvent> = {}): LinkableEvent => ({
  id: uuid(index),
  title: `イベント${index}`,
  category: 'limited_card',
  startDate: '2026-10-01T00:00:00.000+00:00',
  endDate: null,
  ...overrides
})
const first = requestWithAssociations(post())

describe('質問の組み立て', () => {
  test('選択肢のキーはイベントの UUID と該当なしで、Clef のキー制約に合う', () => {
    const question = linkedEventQuestion([event(1), event(2)])
    if (question.type !== 'choice') throw new Error('Expected a choice question')
    expect(Object.keys(question.criteria)).toEqual([uuid(1), uuid(2), LINKED_EVENT_NONE])
    for (const option of Object.keys(question.criteria)) expect(KEY.test(option)).toBe(true)
    expect(question.instructions).toBe(LINKED_EVENT_INSTRUCTIONS)
    expect(question.instructions.length).toBeLessThanOrEqual(2000)
  })

  test('該当なしのキーは UUID と衝突しない（UUID でない ID は選択肢にしない）', () => {
    const options = linkedEventOptions([event(1), event(2, { id: LINKED_EVENT_NONE }), event(3, { id: 'not-a-uuid' })])
    expect(options.map((entry) => entry.id)).toEqual([uuid(1)])
    expect(LINKED_EVENT_NONE).not.toMatch(/^[0-9a-f]{8}-/)
  })

  test('説明は タイトル / 開始日 / 終了日（未定なら未定）/ 種類', () => {
    expect(linkedEventDescription(event(1, { endDate: '2026-10-31T14:59:59.000+00:00' }))).toBe(
      'イベント1 / 開始日 2026-10-01 / 終了日 2026-10-31 / 種類 限定名刺'
    )
    expect(linkedEventDescription(event(1))).toContain('終了日 未定')
    expect(linkedEventDescription(event(1, { category: 'unknown_kind' }))).toContain('種類 unknown_kind')
  })

  test('日付は日本時間の日付で表す（UTC の 15 時は翌日）', () => {
    expect(linkedEventDescription(event(1, { startDate: '2025-12-31T15:00:00.000+00:00' }))).toContain(
      '開始日 2026-01-01'
    )
  })

  test('長いタイトル・種類でも説明は 1000 字以内に収まり、サロゲートペアを割らない', () => {
    const long = event(1, {
      title: '𠮷'.repeat(5000),
      category: 'x'.repeat(5000),
      endDate: '2026-10-31T00:00:00.000+00:00'
    })
    const description = linkedEventDescription(long)
    expect([...description].length).toBeLessThanOrEqual(1000)
    expect(description).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/)
    const question = linkedEventQuestion([long])
    if (question.type !== 'choice') throw new Error('Expected a choice question')
    expect(Object.values(question.criteria).every((text) => text.length <= 1000)).toBe(true)
  })

  test('選択肢は新しい開始日順に最大 50 件で、同じ ID は 1 件にする', () => {
    const many = Array.from({ length: 60 }, (_, index) =>
      event(index + 1, { startDate: `2026-01-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000+00:00` })
    )
    const options = linkedEventOptions([...many, many[0]])
    expect(options).toHaveLength(LINKED_EVENT_MAX_OPTIONS)
    expect(new Set(options.map((entry) => entry.id)).size).toBe(LINKED_EVENT_MAX_OPTIONS)
    const dates = options.map((entry) => entry.startDate)
    expect(dates).toEqual(dates.toSorted().toReversed())
    // 適用し直しても同じ（取得側と質問の組み立て側の両方で絞っても変わらない）。
    expect(linkedEventOptions(options)).toEqual(options)
  })

  test('タイトルが空・日付が読めないイベントは選択肢にしない', () => {
    expect(
      linkedEventOptions([
        event(1, { title: ' ' }),
        event(2, { startDate: 'broken' }),
        event(3, { endDate: 'broken' }),
        event(4)
      ])
    ).toEqual([event(4)])
  })

  test('request は固定の質問 1 問で、state の末尾に探す店舗と配布物の行を足し、Clef の入力として有効', () => {
    const request = createLinkedEventRequest(first, { store: 'akiba', item: '限定名刺', events: [event(1), event(2)] })
    expect(ClefRequestSchema.safeParse(request).success).toBe(true)
    expect(request.model).toBe(first.model)
    expect(Object.keys(request.questions)).toEqual([LINKED_EVENT_QUESTION_KEY])
    expect(request.state.startsWith(first.state)).toBe(true)
    expect(request.state.split('\n').slice(-2)).toEqual([
      '連携先を探す開催店舗: AKIBA店',
      '連携先を探す配布物: 限定名刺'
    ])
    // 配布物が無いとき（旧単一ジョブ）は店舗の行だけ。
    const withoutItem = createLinkedEventRequest(first, { store: 'akiba', events: [event(1)] })
    expect(withoutItem.state.split('\n').at(-1)).toBe('連携先を探す開催店舗: AKIBA店')
    expect(withoutItem.state).not.toContain('連携先を探す配布物')
  })

  test('選択肢にできるイベントが無いと request は作れない', () => {
    expect(() => createLinkedEventRequest(first, { store: 'akiba', events: [] })).toThrow('at least one event')
    expect(() => createLinkedEventRequest(first, { store: 'akiba', events: [event(1, { title: '' })] })).toThrow(
      'at least one event'
    )
  })

  test('3 段目の質問だけを isLinkedEventQuestion が認め、文面や選択肢を変えたものは認めない', () => {
    const question = linkedEventQuestion([event(1)])
    expect(isLinkedEventQuestion(LINKED_EVENT_QUESTION_KEY, question)).toBe(true)
    expect(isLinkedEventQuestion('status', question)).toBe(false)
    if (question.type !== 'choice') throw new Error('Expected a choice question')
    const changed: ClefQuestion = { ...question, instructions: `${question.instructions}追記` }
    expect(isLinkedEventQuestion(LINKED_EVENT_QUESTION_KEY, changed)).toBe(false)
    const foreign: ClefQuestion = { ...question, criteria: { ...question.criteria, akiba: '店舗' } }
    expect(isLinkedEventQuestion(LINKED_EVENT_QUESTION_KEY, foreign)).toBe(false)
    expect(
      isLinkedEventQuestion(LINKED_EVENT_QUESTION_KEY, { type: 'noul', instructions: question.instructions })
    ).toBe(false)
  })
})

describe('連携先を探す店舗は 1 つに決まるときだけ', () => {
  test.each([
    // 従来どおり 1 つに決まれば、投稿アカウントの店舗は使わない。
    { adopted: ['akiba'], storeKey: null, account: 'abeno', expected: 'akiba' },
    { adopted: ['akiba'], storeKey: 'akiba', account: 'abeno', expected: 'akiba' },
    { adopted: ['akiba'], storeKey: null, account: null, expected: 'akiba' },
    // 採用した店舗が無くても、抽出段階の店舗があればその店舗に決まる（投稿アカウントの店舗が同じでも別でも、使うのは抽出段階の店舗）。
    { adopted: [], storeKey: 'akiba', account: 'abeno', expected: 'akiba' },
    { adopted: [], storeKey: 'akiba', account: 'akiba', expected: 'akiba' },
    // 採用した店舗が無く、抽出段階の店舗も無いときだけ、投稿アカウントの店舗。
    { adopted: [], storeKey: null, account: 'tachikawa', expected: 'tachikawa' },
    // 投稿アカウントが店舗アカウントでなければ決まらない。
    { adopted: [], storeKey: null, account: null, expected: null },
    // 採用した店舗が抽出段階の店舗と食い違うときは、どちらにも倒さず、投稿アカウントの店舗にも倒さない。
    { adopted: ['akiba'], storeKey: 'abeno', account: 'abeno', expected: null },
    { adopted: ['akiba'], storeKey: 'abeno', account: 'akiba', expected: null },
    { adopted: ['akiba'], storeKey: 'abeno', account: null, expected: null },
    // 採用した店舗が複数あるときは先頭に倒さず、投稿アカウントの店舗にも倒さない。
    { adopted: ['akiba', 'abeno'], storeKey: null, account: 'akiba', expected: null },
    { adopted: ['akiba', 'abeno'], storeKey: 'akiba', account: 'akiba', expected: null }
  ])(
    '採用 $adopted / 抽出 $storeKey / 投稿アカウント $account → $expected',
    ({ adopted, storeKey, account, expected }) => {
      expect(linkedEventStore(adopted, storeKey, account)).toBe(expected)
    }
  )
})

describe('投稿アカウントの店舗は、判定の入力文の「投稿者」の行と同じ辞書・規則で引く', () => {
  test('店舗の公式アカウントはその店舗に、大文字小文字は区別せずに解決する', () => {
    expect(postAccountStore('bic_tachikawa')).toBe('tachikawa')
    expect(postAccountStore('Bic_Tachikawa')).toBe('tachikawa')
  })

  test('店舗アカウントでない投稿者は null', () => {
    expect(postAccountStore('synthetic_account')).toBeNull()
    expect(postAccountStore('')).toBeNull()
  })

  test('カタログの全店舗アカウントが自店に解決し、入力文の「投稿者」の行と一致する', () => {
    for (const store of detectionStores) {
      if (store.screenName === undefined) throw new Error('Store without an account')
      expect(postAccountStore(store.screenName.toUpperCase())).toBe(store.id)
      const state = requestWithAssociations(post('配布終了しました', { screenName: store.screenName })).state
      expect(state).toContain(`投稿者: @${store.screenName} / ${storeShortName(store.id)}\n`)
    }
  })
})

describe('実投稿 2114255692517564858（立川店の公式アカウントの「配布終了しました」）', () => {
  // 保存済みの回答を再現する: 状態は end（0.988）、店舗は tachikawa が 0.656、店舗の確認の「はい」は 0.6446（どちらも下限 0.7 未満）。
  const tachikawa = post('#ビッ旅 缶バッジ #立川たん ver ただいまを持ちまして配布終了しました', {
    id: '2114255692517564858',
    screenName: 'bic_tachikawa',
    url: 'https://x.com/bic_tachikawa/status/2114255692517564858'
  })
  const firstRequest = requestWithAssociations(tachikawa)
  const confirm = createConfirmRequest(firstRequest, { store: 'tachikawa' })
  const request: ClefRequest = {
    ...firstRequest,
    questions: { ...firstRequest.questions, ...confirm.questions }
  }
  const answers: Record<string, ClefAnswer> = {
    ...fixtures.response(request).answers,
    status: fixtures.choice('end', { end: 0.988, none: 0.01 }),
    store: fixtures.choice('tachikawa', { tachikawa: 0.656, none: 0.2 }),
    store_confirm: { type: 'noul', noul: 0.6446 }
  }
  const stored: ClefResponse = { answers }

  test('判定は end で、店舗は採用されない（store_unconfirmed・store_confirm_low）', () => {
    const decision = evaluateDetection(tachikawa, request, stored, DEFAULT_DETECTION_THRESHOLDS, null)
    expect(decision.status).toBe('held')
    expect(decision.reasons).toEqual(expect.arrayContaining(['store_unconfirmed', 'store_confirm_low']))
    expect(describeDetectionOutcome(tachikawa, answers, decision).action).toBe('end')
    const adopted = decideAssociations(request, answers, DEFAULT_DETECTION_THRESHOLDS)
    expect(adopted.stores).toEqual([])
    expect(adopted.storeConfirmLow).toBe(true)
  })

  test('投稿アカウントの店舗を使わなければ店舗が決まらず（修正前の挙動）、使えば立川店に決まる', () => {
    expect(linkedEventTargetStore(request, stored, DEFAULT_DETECTION_THRESHOLDS, null, null)).toBeNull()
    const account = postAccountStore(tachikawa.screenName)
    expect(linkedEventTargetStore(request, stored, DEFAULT_DETECTION_THRESHOLDS, null, account)).toBe('tachikawa')
  })

  test('3 段目の state の末尾は、フォールバックの店舗でも同じ形の「連携先を探す開催店舗」の行', () => {
    const linked = createLinkedEventRequest(firstRequest, { store: 'tachikawa', item: '缶バッジ', events: [event(1)] })
    expect(linked.state.split('\n').slice(-2)).toEqual(['連携先を探す開催店舗: 立川店', '連携先を探す配布物: 缶バッジ'])
  })
})

describe('応答の採用', () => {
  const events = [event(1), event(2)]
  const request = createLinkedEventRequest(first, { store: 'akiba', events })
  const answered = (answer: ClefAnswer | undefined): ClefResponse => ({
    answers: answer === undefined ? {} : { [LINKED_EVENT_QUESTION_KEY]: answer }
  })
  const top = (choice: string, probability: number, rest: Record<string, number> = {}): ClefAnswer => ({
    type: 'choice',
    choice,
    probabilities: { [choice]: probability, ...rest }
  })

  test('しきい値は固定の 0.7', () => {
    expect(LINKED_EVENT_THRESHOLD).toBe(0.7)
  })

  test('ちょうどしきい値は採用し、未満は採用しない', () => {
    expect(linkedEventProposalOf(request, answered(top(uuid(1), 0.7)), events)).toEqual({
      eventId: uuid(1),
      title: 'イベント1',
      probability: 0.7
    })
    expect(linkedEventProposalOf(request, answered(top(uuid(1), 0.6999)), events)).toBeNull()
    expect(linkedEventProposalOf(request, answered(top(uuid(2), 0.99)), events)?.eventId).toBe(uuid(2))
  })

  test('該当なしは、確率が高くても提案なし', () => {
    expect(linkedEventProposalOf(request, answered(top(LINKED_EVENT_NONE, 0.99)), events)).toBeNull()
  })

  test('確率の欠落（最上位の確率が probabilities に無い）は提案なし', () => {
    expect(
      linkedEventProposalOf(
        request,
        answered({ type: 'choice', choice: uuid(1), probabilities: { [uuid(2)]: 0.2 } }),
        events
      )
    ).toBeNull()
  })

  test('回答なし・型違い・選択肢に無いキーを含む応答・最上位でない選択・確率の合計超過は提案なし', () => {
    expect(linkedEventProposalOf(request, answered(undefined), events)).toBeNull()
    expect(linkedEventProposalOf(request, answered({ type: 'noul', noul: 0.99 }), events)).toBeNull()
    expect(linkedEventProposalOf(request, answered(top(uuid(9), 0.99)), events)).toBeNull()
    expect(linkedEventProposalOf(request, answered(top(uuid(1), 0.8, { [uuid(9)]: 0.1 })), events)).toBeNull()
    expect(linkedEventProposalOf(request, answered(top(uuid(1), 0.75, { [uuid(2)]: 0.8 })), events)).toBeNull()
    expect(linkedEventProposalOf(request, answered(top(uuid(1), 0.9, { [uuid(2)]: 0.9 })), events)).toBeNull()
  })

  test('しきい値を引数で変えられる', () => {
    expect(linkedEventProposalOf(request, answered(top(uuid(1), 0.5)), events, 0.5)?.probability).toBe(0.5)
  })
})

describe('判定結果の JSON への保存', () => {
  const base = {
    relevance: 'detected',
    action: 'end',
    confidence: 0.9,
    evidence: [],
    missingFields: [],
    reasons: ['event_ended']
  }

  test('旧データ（linkedEvent なし）はそのまま読め、提案を足した形も読める', () => {
    const old = WebhookDiscoverySchema.safeParse(base)
    expect(old.success).toBe(true)
    if (old.success) expect(old.data.linkedEvent).toBeUndefined()
    const proposed = WebhookDiscoverySchema.safeParse({
      ...base,
      linkedEvent: { eventId: uuid(1), title: 'イベント1', probability: 0.8 }
    })
    expect(proposed.success).toBe(true)
    if (proposed.success) expect(proposed.data.linkedEvent?.eventId).toBe(uuid(1))
  })

  test('不正な提案（UUID でない ID・範囲外の確率）は破棄せず不正として扱う', () => {
    for (const linkedEvent of [
      { eventId: 'x', title: 't', probability: 0.8 },
      { eventId: uuid(1), title: 't', probability: 1.1 },
      { eventId: uuid(1), title: '', probability: 0.8 }
    ])
      expect(WebhookDiscoverySchema.safeParse({ ...base, linkedEvent }).success).toBe(false)
  })
})
