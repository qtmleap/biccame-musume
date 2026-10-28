import { expect, test } from 'bun:test'
import { rejudgeWebhookJob } from '@api/services/webhook-admin'
import { getWebhookJob } from '@api/services/webhook-jobs'
import { processWebhookJob } from '@api/services/webhook-process'
import { getWebhookPrompt } from '@api/services/webhook-prompt'
import { LINKED_EVENT_QUESTION_KEY } from '@biccame/shared/event-detect/detection'
import {
  candidateOf,
  eventId,
  eventsSnapshot,
  judge,
  type Status,
  seedEvent,
  setup,
  type Value
} from './fixtures/webhook-linked-event'

test('終了の投稿で店舗にまだ終了していないイベントがあれば 3 段目を 1 回聞き、提案を保存して、連携もイベントの変更もしない', async () => {
  const value = await setup('linked-event-proposed', 'end')
  try {
    await seedEvent(value.env, 1, 'akiba')
    await seedEvent(value.env, 2, 'akiba', { end: '2099-01-01T00:00:00.000+00:00' })
    await seedEvent(value.env, 3, 'abeno')
    const before = await eventsSnapshot(value.env)
    const post = await judge(value, '2112378276735750901')
    const candidate = await candidateOf(value, post.id)
    expect(value.calls).toHaveLength(1)
    // 選択肢は、その店舗のまだ終了していないイベント（UUID）と該当なしだけ。他店舗のイベントは出ない。
    const question = value.calls[0].questions[LINKED_EVENT_QUESTION_KEY]
    if (question.type !== 'choice') throw new Error('Expected a choice question')
    expect(Object.keys(question.criteria).toSorted()).toEqual([eventId(1), eventId(2), 'none'].toSorted())
    expect(value.calls[0].state.split('\n').slice(-2)).toEqual([
      '連携先を探す開催店舗: AKIBA店',
      '連携先を探す配布物: 限定名刺'
    ])
    expect(candidate.discovery?.action).toBe('end')
    expect(candidate.discovery?.linkedEvent).toEqual({ eventId: eventId(1), title: '既存イベント1', probability: 0.9 })
    // 自動では連携せず、保留のまま。イベント本体（ended_at を含む）も変更しない。
    expect(candidate.status).toBe('held')
    expect(candidate.eventId).toBeNull()
    expect(candidate.reasons).not.toContain('manually_linked')
    expect(await eventsSnapshot(value.env)).toBe(before)
    const stored = await value.env.DB.prepare('SELECT event_id,answers_json FROM webhook_event_candidates').first<{
      event_id: string | null
      answers_json: string
    }>()
    expect(stored?.event_id).toBeNull()
    // 回答表に生のキーが出ないよう、answers_json には混ぜない。
    expect(stored?.answers_json).not.toContain(LINKED_EVENT_QUESTION_KEY)
    // 3 段目の送信入力も保存され、プロンプト確認から見える。
    const prompt = await getWebhookPrompt(value.env, post.id, candidate.eventUUID)
    expect(prompt.requests).toHaveLength(2)
    expect(prompt.requests[1]).toEqual(value.calls[0])
  } finally {
    await value.cleanup()
  }
}, 60000)

test('提案の確率が下限 0.7 ちょうどなら保存し、未満・該当なしなら 3 段目は聞いても提案を保存しない', async () => {
  const value = await setup('linked-event-threshold', 'end')
  try {
    await seedEvent(value.env, 1, 'akiba')
    value.linked.probability = 0.7
    expect(
      (await candidateOf(value, (await judge(value, '2112378276735750911')).id)).discovery?.linkedEvent?.eventId
    ).toBe(eventId(1))
    value.linked.probability = 0.69
    expect(
      (await candidateOf(value, (await judge(value, '2112378276735750912')).id)).discovery?.linkedEvent
    ).toBeUndefined()
    value.linked.pick = 'none'
    value.linked.probability = 0.99
    const none = await candidateOf(value, (await judge(value, '2112378276735750913')).id)
    expect(none.discovery?.linkedEvent).toBeUndefined()
    expect(none.status).toBe('held')
    expect(value.calls).toHaveLength(3)
  } finally {
    await value.cleanup()
  }
}, 60000)

// 継続（ongoing）で聞くことは webhook-linked-event-update.test.ts で見る。ここは、終了でも継続でもない投稿（開始）で聞かないことを固定する。
test.each<Status>(['start'])(
  '終了でも継続でもない投稿（%s）では 3 段目を聞かない',
  async (status) => {
    const value = await setup(`linked-event-not-end-${status}`, status)
    try {
      await seedEvent(value.env, 1, 'akiba')
      const candidate = await candidateOf(value, (await judge(value, '2112378276735750921')).id)
      expect(candidate.discovery?.action).not.toBe('end')
      expect(candidate.discovery?.action).not.toBe('update')
      expect(candidate.discovery?.linkedEvent).toBeUndefined()
      expect(value.calls).toHaveLength(0)
    } finally {
      await value.cleanup()
    }
  },
  60000
)

test.each(['none', 'multiple'])(
  '判定が店舗を %s と答え、抽出段階の店舗も無くても、投稿者が店舗の公式アカウントならその店舗で 3 段目を聞く',
  async (pick) => {
    const value = await setup(`linked-event-no-store-${pick}`, 'end')
    try {
      await seedEvent(value.env, 1, 'akiba')
      await seedEvent(value.env, 2, 'abeno')
      value.state.picks = { store: pick }
      const candidate = await candidateOf(value, (await judge(value, '2112378276735750931', [])).id)
      expect(candidate.discovery?.action).toBe('end')
      expect(candidate.storeKey).toBeNull()
      expect(candidate.reasons).toContain('store_unconfirmed')
      expect(value.calls).toHaveLength(1)
      expect(value.calls[0].state.split('\n').at(-2)).toBe('連携先を探す開催店舗: AKIBA店')
      expect(candidate.discovery?.linkedEvent?.eventId).toBe(eventId(1))
    } finally {
      await value.cleanup()
    }
  },
  60000
)

// 実投稿 2114255692517564858 の保存済み回答を再現する: 店舗 tachikawa が 0.656、確認の「はい」が 0.6446（どちらも下限 0.7 未満）。
const lowStoreConfidence = (value: Value) => {
  value.state.picks = { store: 'tachikawa', probability: 0.656 }
  value.confirm.yes = 0.6446
}

test('店舗の確率も確認も下限未満で採用されなくても、投稿者が店舗の公式アカウントなら、その店舗で 3 段目を 1 回聞いて提案を保存する', async () => {
  const value = await setup('linked-event-account-store', 'end')
  try {
    await seedEvent(value.env, 1, 'tachikawa')
    await seedEvent(value.env, 2, 'tachikawa', { end: '2099-01-01T00:00:00.000+00:00' })
    await seedEvent(value.env, 3, 'akiba')
    lowStoreConfidence(value)
    const before = await eventsSnapshot(value.env)
    const post = await judge(value, '2114255692517564858', [], 'bic_tachikawa')
    const candidate = await candidateOf(value, post.id)
    // 修正前と同じ前提: 店舗は採用されず（保留）、抽出段階の店舗も無い。
    expect(candidate.status).toBe('held')
    expect(candidate.storeKey).toBeNull()
    expect(candidate.reasons).toEqual(expect.arrayContaining(['store_unconfirmed', 'store_confirm_low']))
    expect(candidate.discovery?.action).toBe('end')
    // 3 段目は 1 回で、選択肢は投稿アカウントの店舗（立川店）の未終了イベントだけ。
    expect(value.calls).toHaveLength(1)
    const question = value.calls[0].questions[LINKED_EVENT_QUESTION_KEY]
    if (question.type !== 'choice') throw new Error('Expected a choice question')
    expect(Object.keys(question.criteria).toSorted()).toEqual([eventId(1), eventId(2), 'none'].toSorted())
    expect(value.calls[0].state.split('\n').slice(-2)).toEqual([
      '連携先を探す開催店舗: 立川店',
      '連携先を探す配布物: 限定名刺'
    ])
    expect(candidate.discovery?.linkedEvent).toEqual({ eventId: eventId(1), title: '既存イベント1', probability: 0.9 })
    // 自動では連携せず、イベントも変えない。送信入力は 1 段目・2 段目（確認）・3 段目の 3 件。
    expect(candidate.eventId).toBeNull()
    expect(await eventsSnapshot(value.env)).toBe(before)
    const prompt = await getWebhookPrompt(value.env, post.id, candidate.eventUUID)
    expect(prompt.requests).toHaveLength(3)
    expect(Object.keys(prompt.requests[1].questions)).toContain('store_confirm')
    expect(prompt.requests[2]).toEqual(value.calls[0])
  } finally {
    await value.cleanup()
  }
}, 60000)

test('投稿者が店舗の公式アカウントでなければ、同じ回答でも 3 段目を聞かない（そもそも構造的に対象外で、終了の判定にならない）', async () => {
  const value = await setup('linked-event-account-not-store', 'end')
  try {
    await seedEvent(value.env, 1, 'tachikawa')
    lowStoreConfidence(value)
    const candidate = await candidateOf(value, (await judge(value, '2114255692517564859', [], 'synthetic_account')).id)
    // 店舗アカウント以外の投稿はキーワード判定の前に構造で除外されるので、action は end にならず、投稿アカウントの店舗への切り替えの対象にもならない。
    // 切り替え側の「店舗アカウントでなければ決めない」は shared のテスト（postAccountStore・linkedEventStore）で見る。
    expect(candidate.reasons).toContain('non_store_account')
    expect(candidate.discovery?.action).toBe('none')
    expect(candidate.discovery?.linkedEvent).toBeUndefined()
    expect(value.calls).toHaveLength(0)
  } finally {
    await value.cleanup()
  }
}, 60000)

test('すでに提案なしで保留になっている投稿も、「再実行」で投稿アカウントの店舗の提案が付く', async () => {
  const value = await setup('linked-event-rejudge-held', 'end')
  try {
    lowStoreConfidence(value)
    const post = await judge(value, '2114255692517564861', [], 'bic_tachikawa')
    const first = await candidateOf(value, post.id)
    // 立川店に未終了のイベントが無い間の判定: 3 段目は聞かず、提案なしの保留。
    expect(first.status).toBe('held')
    expect(first.discovery?.linkedEvent).toBeUndefined()
    expect(value.calls).toHaveLength(0)
    await seedEvent(value.env, 1, 'tachikawa')
    await rejudgeWebhookJob(value.env, post.id, first.eventUUID)
    await processWebhookJob(value.env, post.id)
    const again = await candidateOf(value, post.id)
    expect(value.calls).toHaveLength(1)
    expect(again.status).toBe('held')
    expect(again.eventId).toBeNull()
    expect(again.discovery?.linkedEvent).toEqual({ eventId: eventId(1), title: '既存イベント1', probability: 0.9 })
  } finally {
    await value.cleanup()
  }
}, 60000)

test('判定で別の店舗が確定しているときは従来どおりその店舗を使い、投稿アカウントの店舗には倒さない', async () => {
  const value = await setup('linked-event-adopted-over-account', 'end')
  try {
    await seedEvent(value.env, 1, 'tachikawa')
    await seedEvent(value.env, 2, 'abeno')
    value.state.picks = { store: 'abeno' }
    // 偽の AI は abeno の未終了イベント（選択肢にあるもの）を選ぶ。
    value.linked.pick = eventId(2)
    const candidate = await candidateOf(value, (await judge(value, '2114255692517564860', [], 'bic_tachikawa')).id)
    expect(value.calls).toHaveLength(1)
    const question = value.calls[0].questions[LINKED_EVENT_QUESTION_KEY]
    if (question.type !== 'choice') throw new Error('Expected a choice question')
    expect(Object.keys(question.criteria).toSorted()).toEqual([eventId(2), 'none'].toSorted())
    expect(value.calls[0].state.split('\n').at(-2)).toBe('連携先を探す開催店舗: あべのキューズモール店')
    expect(candidate.discovery?.linkedEvent?.eventId).toBe(eventId(2))
  } finally {
    await value.cleanup()
  }
}, 60000)

test('抽出段階の店舗と判定で採用した店舗が食い違うときは、どちらかに倒さず 3 段目を聞かない', async () => {
  const value = await setup('linked-event-store-mismatch', 'end')
  try {
    await seedEvent(value.env, 1, 'akiba')
    await seedEvent(value.env, 2, 'abeno')
    value.state.picks = { store: 'abeno' }
    const candidate = await candidateOf(value, (await judge(value, '2112378276735750936')).id)
    expect(candidate.discovery?.linkedEvent).toBeUndefined()
    expect(value.calls).toHaveLength(0)
  } finally {
    await value.cleanup()
  }
}, 60000)

test('店舗に未終了のイベントが無いとき（終了済み・過去の終了予定・他店舗だけ）は 3 段目を聞かない', async () => {
  const value = await setup('linked-event-no-unfinished', 'end')
  try {
    await seedEvent(value.env, 1, 'akiba', { endedAt: '2026-10-20T00:00:00.000+00:00' })
    await seedEvent(value.env, 2, 'akiba', { end: '2020-01-01T14:59:59.000+00:00' })
    await seedEvent(value.env, 3, 'abeno')
    const before = await eventsSnapshot(value.env)
    const candidate = await candidateOf(value, (await judge(value, '2112378276735750941')).id)
    expect(candidate.discovery?.action).toBe('end')
    expect(candidate.discovery?.linkedEvent).toBeUndefined()
    expect(value.calls).toHaveLength(0)
    expect(await eventsSnapshot(value.env)).toBe(before)
  } finally {
    await value.cleanup()
  }
}, 60000)

test.each(['fail', 'garbage'] as const)(
  '3 段目の AI が失敗・不正な応答（%s）でも判定は完了し、提案なしで警告だけを残す',
  async (mode) => {
    const value = await setup(`linked-event-${mode}`, 'end')
    try {
      await seedEvent(value.env, 1, 'akiba')
      value.linked[mode] = true
      const post = await judge(value, '2112378276735750951')
      const job = await getWebhookJob(value.env, post.id)
      const candidate = job.candidates[0]
      expect(value.calls).toHaveLength(1)
      // 判定全体は失敗にならず、通常どおり保留として完了する。
      expect(candidate.status).toBe('held')
      expect(candidate.lastError).toBeNull()
      expect(candidate.discovery?.action).toBe('end')
      expect(candidate.discovery?.linkedEvent).toBeUndefined()
      expect(candidate.eventId).toBeNull()
      expect(value.warn).toHaveBeenCalled()
      expect(String(value.warn.mock.calls[0][0])).toBe('[webhook-linked-event]')
    } finally {
      await value.cleanup()
    }
  },
  60000
)
