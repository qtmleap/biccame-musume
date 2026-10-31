import { expect, test } from 'bun:test'
import { getWebhookPrompt } from '@api/services/webhook-prompt'
import type { ClefRequest } from '@biccame/shared/event-detect/clef'
import { LINKED_EVENT_QUESTION_KEY } from '@biccame/shared/event-detect/detection'
import { candidateOf, eventId, judge, seedEvent, setup, type Value } from './fixtures/webhook-linked-event'

// 3段目（連携先の提案）の選択肢にするイベントの絞り込み。継続中（まだ終了していない）のうち、投稿より前に始まり、
// 1段目の配布物（category）の最上位の選択肢から決めた種類と一致するものだけを選択肢にする（確率・しきい値は見ない）。種類の一致は必須で、
// 配布物の最上位が none で種類が決まらない投稿と、絞って 0 件になる投稿では、全種類に広げず 3 段目を聞かない。
// 偽の AI の1段目は、本文に根拠のある種類（名刺・アクキー）を高い確率で選ぶ。投稿の日時は 2026-10-11（fixture の makePost）。
const ACKEY_POST = 'アクキーの配布は本日で終了しました。'

/**
 * events テーブルを引く SQL（3段目の選択肢の取得）が発行された回数を数える。stop で元の DB に戻す。
 * D1 のバインディングは Proxy で prepare が自前のプロパティではないため、spyOn は効かない。env.DB を記録用の Proxy に差し替える。
 */
const watchEventQueries = (value: Value) => {
  const original = value.env.DB
  const queries: string[] = []
  const watched = new Proxy(original, {
    get: (target, property) => {
      if (property === 'prepare')
        return (sql: string) => {
          queries.push(sql)
          return target.prepare(sql)
        }
      const member = Reflect.get(target, property)
      return typeof member === 'function' ? member.bind(target) : member
    }
  })
  Object.assign(value.env, { DB: watched })
  return {
    count: () => queries.filter((sql) => sql.includes('FROM events e')).length,
    stop: () => Object.assign(value.env, { DB: original })
  }
}

/** 3段目に送った選択肢のうち、イベントのもの（該当なしを除く）のキー。 */
const optionsOf = (request: ClefRequest): string[] => {
  const question = request.questions[LINKED_EVENT_QUESTION_KEY]
  if (question.type !== 'choice') throw new Error('Expected a choice question')
  return Object.keys(question.criteria)
    .filter((key) => key !== 'none')
    .toSorted()
}
const sorted = (...indexes: number[]) => indexes.map(eventId).toSorted()

test('配布物の最上位がアクキーなら、3段目の選択肢はアクキーのイベントだけで、他の種類・他店舗は入らない', async () => {
  const value = await setup('linked-event-kind-ackey', 'end')
  try {
    await seedEvent(value.env, 1, 'akiba', { category: 'ackey' })
    await seedEvent(value.env, 2, 'akiba', { category: 'limited_card' })
    await seedEvent(value.env, 3, 'akiba', { category: 'acsta' })
    await seedEvent(value.env, 4, 'abeno', { category: 'ackey' })
    const queries = watchEventQueries(value)
    const post = await judge(value, '2112378276735751001', ['akiba'], 'bic_akiba', ACKEY_POST)
    // 種類が決まるときは、選択肢のためにイベントを 1 回取りに行く（計測が効いていることの確認も兼ねる）。
    expect(queries.count()).toBe(1)
    queries.stop()
    const candidate = await candidateOf(value, post.id)
    expect(candidate.discovery?.action).toBe('end')
    expect(value.calls).toHaveLength(1)
    expect(optionsOf(value.calls[0])).toEqual(sorted(1))
    expect(candidate.discovery?.linkedEvent).toEqual({ eventId: eventId(1), title: '既存イベント1', probability: 0.8 })
    // 送った選択肢のとおりに保存され、プロンプト確認から見える。
    const prompt = await getWebhookPrompt(value.env, post.id, candidate.eventUUID)
    expect(prompt.requests).toHaveLength(2)
    expect(prompt.requests[1]).toEqual(value.calls[0])
  } finally {
    await value.cleanup()
  }
}, 60000)

test('配布物が名刺なら限定と通常の2種、アクスタ・その他ならそれぞれの種類だけが選択肢になる', async () => {
  const value = await setup('linked-event-kind-others', 'end')
  try {
    await seedEvent(value.env, 1, 'akiba', { category: 'limited_card' })
    await seedEvent(value.env, 2, 'akiba', { category: 'regular_card' })
    await seedEvent(value.env, 3, 'akiba', { category: 'ackey' })
    await seedEvent(value.env, 4, 'akiba', { category: 'acsta' })
    await seedEvent(value.env, 5, 'akiba', { category: 'other' })
    // 本文は限定名刺。偽の AI は limited_card を選ぶので、名刺2種。
    await judge(value, '2112378276735751011')
    expect(optionsOf(value.calls[0])).toEqual(sorted(1, 2))
    // 配布物の回答を通常名刺に差し替えても、名刺2種。
    value.category.choice = 'regular_card'
    await judge(value, '2112378276735751012')
    expect(optionsOf(value.calls[1])).toEqual(sorted(1, 2))
    // その他（ギフトカードも other に対応づく）は other のイベントだけ。
    value.category.choice = 'other'
    await judge(value, '2112378276735751013')
    expect(optionsOf(value.calls[2])).toEqual(sorted(5))
    expect(value.calls).toHaveLength(3)
  } finally {
    await value.cleanup()
  }
}, 60000)

test.each([
  ['アクキー（確率 0.5）', ACKEY_POST, 0.5, [1]],
  ['限定名刺（確率 0.3）', '限定名刺の配布は本日で終了しました。', 0.3, [2, 4]]
])(
  '配布物の確率が category のしきい値（0.85）未満でも、最上位の %s の種類で絞って 3 段目を聞く',
  async (_name, text, probability, expected) => {
    const value = await setup('linked-event-kind-low-probability', 'end')
    try {
      await seedEvent(value.env, 1, 'akiba', { category: 'ackey' })
      await seedEvent(value.env, 2, 'akiba', { category: 'limited_card' })
      await seedEvent(value.env, 3, 'akiba', { category: 'other' })
      await seedEvent(value.env, 4, 'akiba', { category: 'regular_card' })
      // 選択肢は偽の AI の最上位のまま、確率だけを下げる。3段目の偽の AI は、絞った選択肢の先頭のイベントを選ぶ。
      value.category.probability = probability
      value.linked.pick = eventId(expected[0])
      const queries = watchEventQueries(value)
      const post = await judge(value, '2112378276735751021', ['akiba'], 'bic_akiba', text)
      expect(queries.count()).toBe(1)
      queries.stop()
      const candidate = await candidateOf(value, post.id)
      expect(candidate.discovery?.action).toBe('end')
      expect(value.calls).toHaveLength(1)
      expect(optionsOf(value.calls[0])).toEqual(sorted(...expected))
      expect(candidate.discovery?.linkedEvent?.eventId).toBe(eventId(expected[0]))
    } finally {
      await value.cleanup()
    }
  },
  60000
)

test.each([
  ['確率が高い', 0.99],
  ['確率が低い', 0.4]
])(
  '配布物の最上位が none（%s）なら種類が決まらず、全種類に広げず、イベントの取得も Clef の呼び出しもせず、提案しない',
  async (_name, probability) => {
    const value = await setup('linked-event-kind-undecided', 'end')
    try {
      // どの種類のイベントも継続中で存在する（種類で絞れば候補になる）のに、種類が決まらないので聞かない。
      await seedEvent(value.env, 1, 'akiba', { category: 'ackey' })
      await seedEvent(value.env, 2, 'akiba', { category: 'limited_card' })
      await seedEvent(value.env, 3, 'akiba', { category: 'other' })
      value.category.choice = 'none'
      value.category.probability = probability
      const queries = watchEventQueries(value)
      const post = await judge(value, '2112378276735751022')
      expect(queries.count()).toBe(0)
      queries.stop()
      const candidate = await candidateOf(value, post.id)
      expect(candidate.discovery?.action).toBe('end')
      expect(candidate.discovery?.linkedEvent).toBeUndefined()
      expect(candidate.status).toBe('held')
      expect(value.calls).toHaveLength(0)
      expect(value.warn).not.toHaveBeenCalled()
      // 3段目の送信入力は残らない（1段目だけ）。
      expect((await getWebhookPrompt(value.env, post.id, candidate.eventUUID)).requests).toHaveLength(1)
    } finally {
      await value.cleanup()
    }
  },
  60000
)

test('種類で絞って 0 件なら、全種類に広げず 3 段目を聞かない（Clef を呼ばず、送信入力にも 3 段目を残さず、提案なし）', async () => {
  const value = await setup('linked-event-kind-empty', 'end')
  try {
    // アクキーの投稿だが、この店舗の継続中のイベントは名刺と、終了済みのアクキーだけ。
    await seedEvent(value.env, 1, 'akiba', { category: 'limited_card' })
    await seedEvent(value.env, 2, 'akiba', { category: 'ackey', endedAt: '2026-10-05T00:00:00.000+00:00' })
    await seedEvent(value.env, 3, 'abeno', { category: 'ackey' })
    const post = await judge(value, '2112378276735751031', ['akiba'], 'bic_akiba', ACKEY_POST)
    const candidate = await candidateOf(value, post.id)
    expect(candidate.discovery?.action).toBe('end')
    expect(candidate.discovery?.linkedEvent).toBeUndefined()
    expect(candidate.status).toBe('held')
    expect(value.calls).toHaveLength(0)
    expect(value.warn).not.toHaveBeenCalled()
    expect((await getWebhookPrompt(value.env, post.id, candidate.eventUUID)).requests).toHaveLength(1)
  } finally {
    await value.cleanup()
  }
}, 60000)

test('投稿（2026-10-11）より後に始まるイベントは選択肢に入らない。ちょうど投稿日時に始まるものは入り、基準は今ではなく投稿日時', async () => {
  const value = await setup('linked-event-kind-posted-at', 'end')
  try {
    // 1: 投稿より前に開始 2: ちょうど投稿日時に開始 3: 投稿の 1 ミリ秒後に開始 4: 投稿の 9 日後に開始（今日より前だが投稿より後）
    await seedEvent(value.env, 1, 'akiba', { start: '2026-10-01T00:00:00.000+00:00' })
    await seedEvent(value.env, 2, 'akiba', { start: '2026-10-11T00:00:00.000+00:00' })
    await seedEvent(value.env, 3, 'akiba', { start: '2026-10-11T00:00:00.001+00:00' })
    await seedEvent(value.env, 4, 'akiba', { start: '2026-10-20T00:00:00.000+00:00' })
    await candidateOf(value, (await judge(value, '2112378276735751041')).id)
    expect(value.calls).toHaveLength(1)
    expect(optionsOf(value.calls[0])).toEqual(sorted(1, 2))
  } finally {
    await value.cleanup()
  }
}, 60000)

test('継続中のイベントがすべて投稿より後に始まるものなら、3段目を聞かない', async () => {
  const value = await setup('linked-event-kind-all-later', 'end')
  try {
    await seedEvent(value.env, 1, 'akiba', { start: '2026-10-12T00:00:00.000+00:00' })
    await seedEvent(value.env, 2, 'akiba', { start: '2026-11-01T00:00:00.000+00:00' })
    const candidate = await candidateOf(value, (await judge(value, '2112378276735751051')).id)
    expect(candidate.discovery?.action).toBe('end')
    expect(candidate.discovery?.linkedEvent).toBeUndefined()
    expect(value.calls).toHaveLength(0)
  } finally {
    await value.cleanup()
  }
}, 60000)
