import { expect, test } from 'bun:test'
import { getWebhookPrompt } from '@api/services/webhook-prompt'
import {
  isLinkedEventQuestion,
  LINKED_EVENT_INSTRUCTIONS,
  LINKED_EVENT_QUESTION_KEY
} from '@biccame/shared/event-detect/detection'
import {
  CONTINUING,
  candidateOf,
  eventId,
  eventsSnapshot,
  judge,
  seedEvent,
  setup
} from './fixtures/webhook-linked-event'

// 継続（update。配布中・残数など）と判定された投稿にも、終了と同じ条件で 3 段目（連携先の提案）を聞く。

test('継続の投稿で店舗にまだ終了していないイベントがあれば 3 段目を 1 回聞き、提案を保存して、連携もイベントの変更もしない', async () => {
  const value = await setup('linked-event-update-proposed', 'ongoing')
  try {
    await seedEvent(value.env, 1, 'akiba')
    await seedEvent(value.env, 2, 'akiba', { end: '2099-01-01T00:00:00.000+00:00' })
    await seedEvent(value.env, 3, 'abeno')
    const before = await eventsSnapshot(value.env)
    const post = await judge(value, '2112378276735750961', ['akiba'], 'bic_akiba', CONTINUING)
    const candidate = await candidateOf(value, post.id)
    expect(candidate.discovery?.action).toBe('update')
    expect(value.calls).toHaveLength(1)
    const question = value.calls[0].questions[LINKED_EVENT_QUESTION_KEY]
    if (question.type !== 'choice') throw new Error('Expected a choice question')
    expect(Object.keys(question.criteria).toSorted()).toEqual([eventId(1), eventId(2), 'none'].toSorted())
    expect(value.calls[0].state.split('\n').slice(-2)).toEqual([
      '連携先を探す開催店舗: AKIBA店',
      '連携先を探す配布物: 限定名刺'
    ])
    expect(candidate.discovery?.linkedEvent).toEqual({ eventId: eventId(1), title: '既存イベント1', probability: 0.9 })
    // 自動では連携せず、保留のまま。イベント本体も変更しない。
    expect(candidate.status).toBe('held')
    expect(candidate.eventId).toBeNull()
    expect(candidate.reasons).not.toContain('manually_linked')
    expect(await eventsSnapshot(value.env)).toBe(before)
    // 3 段目の送信入力も保存され、プロンプト確認から見える（新しい質問文で保存を許可される）。
    const prompt = await getWebhookPrompt(value.env, post.id, candidate.eventUUID)
    expect(prompt.requests).toHaveLength(2)
    expect(prompt.requests[1]).toEqual(value.calls[0])
    const saved = prompt.requests[1].questions[LINKED_EVENT_QUESTION_KEY]
    expect(saved.instructions).toBe(LINKED_EVENT_INSTRUCTIONS)
    expect(isLinkedEventQuestion(LINKED_EVENT_QUESTION_KEY, saved)).toBe(true)
  } finally {
    await value.cleanup()
  }
}, 60000)

test('継続の投稿でも、確率が下限 0.7 未満・該当なしなら 3 段目は聞いても提案を保存しない', async () => {
  const value = await setup('linked-event-update-threshold', 'ongoing')
  try {
    await seedEvent(value.env, 1, 'akiba')
    value.linked.probability = 0.69
    expect(
      (await candidateOf(value, (await judge(value, '2112378276735750962', ['akiba'], 'bic_akiba', CONTINUING)).id))
        .discovery?.linkedEvent
    ).toBeUndefined()
    value.linked.pick = 'none'
    value.linked.probability = 0.99
    const none = await candidateOf(
      value,
      (await judge(value, '2112378276735750963', ['akiba'], 'bic_akiba', CONTINUING)).id
    )
    expect(none.discovery?.action).toBe('update')
    expect(none.discovery?.linkedEvent).toBeUndefined()
    expect(none.status).toBe('held')
    expect(value.calls).toHaveLength(2)
  } finally {
    await value.cleanup()
  }
}, 60000)

test('継続の投稿でも、投稿者が店舗の公式アカウントなら、店舗が決まらなくてもその店舗で 3 段目を聞く', async () => {
  const value = await setup('linked-event-update-account-store', 'ongoing')
  try {
    await seedEvent(value.env, 1, 'akiba')
    await seedEvent(value.env, 2, 'abeno')
    value.state.picks = { store: 'none' }
    const candidate = await candidateOf(
      value,
      (await judge(value, '2112378276735750964', [], 'bic_akiba', CONTINUING)).id
    )
    expect(candidate.discovery?.action).toBe('update')
    expect(candidate.storeKey).toBeNull()
    expect(value.calls).toHaveLength(1)
    expect(value.calls[0].state.split('\n').at(-2)).toBe('連携先を探す開催店舗: AKIBA店')
    expect(candidate.discovery?.linkedEvent?.eventId).toBe(eventId(1))
  } finally {
    await value.cleanup()
  }
}, 60000)

test('継続の投稿で、店舗が決まらないとき（抽出段階の店舗と採用した店舗の食い違い・店舗アカウントでない投稿者）は 3 段目を聞かない', async () => {
  const value = await setup('linked-event-update-no-store', 'ongoing')
  try {
    await seedEvent(value.env, 1, 'akiba')
    await seedEvent(value.env, 2, 'abeno')
    value.state.picks = { store: 'abeno' }
    const mismatch = await candidateOf(
      value,
      (await judge(value, '2112378276735750965', ['akiba'], 'bic_akiba', CONTINUING)).id
    )
    expect(mismatch.discovery?.linkedEvent).toBeUndefined()
    // 店舗アカウントでない投稿者は、構造的に対象外（action は none）で、そもそも継続にならない。
    const account = await candidateOf(
      value,
      (await judge(value, '2112378276735750966', [], 'synthetic_account', CONTINUING)).id
    )
    expect(account.discovery?.action).toBe('none')
    expect(account.discovery?.linkedEvent).toBeUndefined()
    expect(value.calls).toHaveLength(0)
  } finally {
    await value.cleanup()
  }
}, 60000)

test('継続の投稿で、店舗に未終了のイベントが無いとき（終了済み・過去の終了予定・他店舗だけ）は 3 段目を聞かない', async () => {
  const value = await setup('linked-event-update-no-unfinished', 'ongoing')
  try {
    await seedEvent(value.env, 1, 'akiba', { endedAt: '2026-10-20T00:00:00.000+00:00' })
    await seedEvent(value.env, 2, 'akiba', { end: '2020-01-01T14:59:59.000+00:00' })
    await seedEvent(value.env, 3, 'abeno')
    const before = await eventsSnapshot(value.env)
    const candidate = await candidateOf(
      value,
      (await judge(value, '2112378276735750967', ['akiba'], 'bic_akiba', CONTINUING)).id
    )
    expect(candidate.discovery?.action).toBe('update')
    expect(candidate.discovery?.linkedEvent).toBeUndefined()
    expect(value.calls).toHaveLength(0)
    expect(await eventsSnapshot(value.env)).toBe(before)
  } finally {
    await value.cleanup()
  }
}, 60000)

test.each(['fail', 'garbage'] as const)(
  '継続の投稿でも、3 段目の AI が失敗・不正な応答（%s）なら判定は完了し、提案なしで警告だけを残す',
  async (mode) => {
    const value = await setup(`linked-event-update-${mode}`, 'ongoing')
    try {
      await seedEvent(value.env, 1, 'akiba')
      value.linked[mode] = true
      const candidate = await candidateOf(
        value,
        (await judge(value, '2112378276735750968', ['akiba'], 'bic_akiba', CONTINUING)).id
      )
      expect(value.calls).toHaveLength(1)
      expect(candidate.status).toBe('held')
      expect(candidate.lastError).toBeNull()
      expect(candidate.discovery?.action).toBe('update')
      expect(candidate.discovery?.linkedEvent).toBeUndefined()
      expect(value.warn).toHaveBeenCalled()
    } finally {
      await value.cleanup()
    }
  },
  60000
)

// 登録（create）・要確認（review）・対象外（none。判定の ignore は記録では none になる）の投稿では、未終了のイベントがあっても聞かない。
test('登録（create）の投稿では 3 段目を聞かない', async () => {
  const value = await setup('linked-event-create', 'start')
  try {
    await seedEvent(value.env, 1, 'akiba')
    const candidate = await candidateOf(value, (await judge(value, '2112378276735750971')).id)
    expect(candidate.discovery?.action).toBe('create')
    expect(candidate.status).toBe('registered')
    expect(candidate.discovery?.linkedEvent).toBeUndefined()
    expect(value.calls).toHaveLength(0)
  } finally {
    await value.cleanup()
  }
}, 60000)

test.each(['ongoing', 'end'] as const)(
  '要確認（review）の投稿（状態は %s でも is_event が低い）では 3 段目を聞かない',
  async (status) => {
    const value = await setup(`linked-event-review-${status}`, status)
    try {
      await seedEvent(value.env, 1, 'akiba')
      value.eventScore.value = 0.7
      const candidate = await candidateOf(
        value,
        (await judge(value, '2112378276735750972', ['akiba'], 'bic_akiba', CONTINUING)).id
      )
      expect(candidate.discovery?.action).toBe('review')
      expect(candidate.discovery?.linkedEvent).toBeUndefined()
      expect(value.calls).toHaveLength(0)
    } finally {
      await value.cleanup()
    }
  },
  60000
)

test.each(['ongoing', 'end'] as const)(
  '対象外（none）の投稿（状態は %s でも is_event が低い）では 3 段目を聞かない',
  async (status) => {
    const value = await setup(`linked-event-none-${status}`, status)
    try {
      await seedEvent(value.env, 1, 'akiba')
      value.eventScore.value = 0.1
      const candidate = await candidateOf(
        value,
        (await judge(value, '2112378276735750973', ['akiba'], 'bic_akiba', CONTINUING)).id
      )
      expect(candidate.discovery?.action).toBe('none')
      expect(candidate.discovery?.linkedEvent).toBeUndefined()
      expect(value.calls).toHaveLength(0)
    } finally {
      await value.cleanup()
    }
  },
  60000
)
