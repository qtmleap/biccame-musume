import { expect, spyOn, test } from 'bun:test'
import * as discord from '@api/services/discord'
import { rejudgeWebhookJob } from '@api/services/webhook-admin'
import { getWebhookJob, insertWebhookJob } from '@api/services/webhook-jobs'
import { processWebhookJob } from '@api/services/webhook-process'
import { getWebhookPrompt } from '@api/services/webhook-prompt'
import { type ClefRequest, ClefRequestSchema, ClefResponseSchema } from '@biccame/shared/event-detect/clef'
import { LINKED_EVENT_QUESTION_KEY } from '@biccame/shared/event-detect/detection'
import { fixture, makePost, migrate } from './fixtures/webhook-multiple-events'

const ENDED = '限定名刺の配布は本日で終了しました。'
const eventId = (index: number) => `550e8400-e29b-41d4-a716-${String(index).padStart(12, '0')}`
// 全項目を高確度で答えるフェイクの AI の status の回答を差し替えるときの値（end は終了、ongoing は継続）。
type Status = 'end' | 'ongoing' | 'start'
// 3 段目の応答。pick は選ぶ選択肢（'none' は該当なし）、probability は選んだ選択肢の確率。fail は送信自体の失敗、garbage は不正な応答。
type Linked = { pick: string; probability: number; fail: boolean; garbage: boolean }

const setup = async (name: string, status: Status) => {
  const base = await fixture(name)
  await migrate(base.env.DB)
  const delivery = spyOn(discord, 'notifyEventDetection').mockResolvedValue({ status: 'sent', messageId: '1234567890' })
  const warn = spyOn(console, 'warn').mockImplementation(() => {})
  const calls: ClefRequest[] = []
  const linked: Linked = { pick: eventId(1), probability: 0.9, fail: false, garbage: false }
  // 2段目（確認）の「はい」の確率。null なら元のフェイクの AI（0.99）のまま。
  const confirm: { yes: number | null } = { yes: null }
  // Object.assign は base.env を書き換えるので、元のフェイクの AI は先に取っておく。
  const inner = base.env.AI
  const env = Object.assign(base.env, {
    AI: {
      run: async (model: string, raw: unknown) => {
        const request = ClefRequestSchema.safeParse(raw)
        if (!request.success) throw new Error('Invalid request')
        const question = request.data.questions[LINKED_EVENT_QUESTION_KEY]
        if (question !== undefined) {
          calls.push(request.data)
          if (linked.fail) throw new Error('Synthetic linked event failure')
          if (linked.garbage) return { answers: {} }
          return {
            answers: {
              [LINKED_EVENT_QUESTION_KEY]: {
                type: 'choice',
                choice: linked.pick,
                probabilities: { [linked.pick]: linked.probability }
              }
            }
          }
        }
        const yes = confirm.yes
        if (
          yes !== null &&
          request.data.questions.is_event === undefined &&
          request.data.questions.distribution_item_count === undefined
        )
          return {
            answers: Object.fromEntries(
              Object.keys(request.data.questions).map((key) => [key, { type: 'noul', noul: yes }])
            )
          }
        const response = ClefResponseSchema.safeParse(await inner.run(model, raw))
        if (!response.success) throw new Error('Invalid fake response')
        if (request.data.questions.is_event === undefined) return response.data
        return {
          answers: {
            ...response.data.answers,
            status: { type: 'choice', choice: status, probabilities: { [status]: 0.99 } }
          }
        }
      }
    }
  })
  const cleanup = async () => {
    delivery.mockRestore()
    warn.mockRestore()
    await base.cleanup()
  }
  return { env, state: base.state, calls, linked, confirm, warn, cleanup }
}
type Value = Awaited<ReturnType<typeof setup>>

const seedEvent = async (
  env: Value['env'],
  index: number,
  store: string,
  overrides: { end?: string | null; endedAt?: string | null } = {}
) => {
  const stamp = '2026-10-01T00:00:00.000+00:00'
  await env.DB.prepare(
    'INSERT INTO events(id,category,title,start_date,end_date,ended_at,updated_at) VALUES (?,?,?,?,?,?,?)'
  )
    .bind(
      eventId(index),
      'limited_card',
      `既存イベント${index}`,
      stamp,
      overrides.end === undefined ? null : overrides.end,
      overrides.endedAt === undefined ? null : overrides.endedAt,
      stamp
    )
    .run()
  await env.DB.prepare('INSERT INTO event_stores(id,event_id,store_key,updated_at) VALUES (?,?,?,?)')
    .bind(crypto.randomUUID(), eventId(index), store, stamp)
    .run()
}
const eventsSnapshot = async (env: Value['env']) =>
  JSON.stringify([
    (await env.DB.prepare('SELECT * FROM events ORDER BY id').all()).results,
    (await env.DB.prepare('SELECT * FROM event_stores ORDER BY id').all()).results
  ])

// screenName は投稿者。既定は秋葉原店の公式アカウント。店舗アカウントでない投稿者を渡すと、投稿アカウントの店舗は決まらない。
const judge = async (value: Value, id: string, stores: string[] = ['akiba'], screenName = 'bic_akiba') => {
  const post = { ...makePost(id, ENDED), screenName, url: `https://x.com/${screenName}/status/${id}` }
  await insertWebhookJob(value.env, post)
  await processWebhookJob(value.env, post.id, {
    extractor: async () => ({ events: [{ item: '限定名刺', stores, characterIds: ['akiba'], evidence: [ENDED] }] })
  })
  return post
}
const candidateOf = async (value: Value, postId: string) => {
  const job = await getWebhookJob(value.env, postId)
  expect(job.candidates).toHaveLength(1)
  return job.candidates[0]
}

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

test.each<Status>(['ongoing', 'start'])(
  '終了以外の投稿（%s）では 3 段目を聞かない',
  async (status) => {
    const value = await setup(`linked-event-not-end-${status}`, status)
    try {
      await seedEvent(value.env, 1, 'akiba')
      const candidate = await candidateOf(value, (await judge(value, '2112378276735750921')).id)
      expect(candidate.discovery?.action).not.toBe('end')
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
