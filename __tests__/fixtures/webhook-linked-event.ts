import { expect, spyOn } from 'bun:test'
import * as discord from '@api/services/discord'
import { getWebhookJob, insertWebhookJob } from '@api/services/webhook-jobs'
import { processWebhookJob } from '@api/services/webhook-process'
import { type ClefRequest, ClefRequestSchema, ClefResponseSchema } from '@biccame/shared/event-detect/clef'
import { LINKED_EVENT_QUESTION_KEY } from '@biccame/shared/event-detect/detection'
import { fixture, makePost, migrate } from './webhook-multiple-events'

// 連携先の提案（3段目）の統合テストが共有する、フェイクの AI・DB のセットアップ。

export const ENDED = '限定名刺の配布は本日で終了しました。'
/** 継続（配布中・残数）を知らせる投稿の本文。 */
export const CONTINUING = '限定名刺の配布は残りわずかです。まだ配布中です。'
export const eventId = (index: number) => `550e8400-e29b-41d4-a716-${String(index).padStart(12, '0')}`
// 全項目を高確度で答えるフェイクの AI の status の回答を差し替えるときの値（end は終了、ongoing は継続）。
export type Status = 'end' | 'ongoing' | 'start'
// 3 段目の応答。pick は選ぶ選択肢（'none' は該当なし）、probability は選んだ選択肢の確率。fail は送信自体の失敗、garbage は不正な応答。
export type Linked = { pick: string; probability: number; fail: boolean; garbage: boolean }

export const setup = async (name: string, status: Status) => {
  const base = await fixture(name)
  await migrate(base.env.DB)
  const delivery = spyOn(discord, 'notifyEventDetection').mockResolvedValue({ status: 'sent', messageId: '1234567890' })
  const warn = spyOn(console, 'warn').mockImplementation(() => {})
  const calls: ClefRequest[] = []
  const linked: Linked = { pick: eventId(1), probability: 0.9, fail: false, garbage: false }
  // 2段目（確認）の「はい」の確率。null なら元のフェイクの AI（0.99）のまま。
  const confirm: { yes: number | null } = { yes: null }
  // is_event の確率。null なら元のフェイクの AI（0.99）のまま。低くすると、状態に関わらず「要確認」の判定になる。
  const eventScore: { value: number | null } = { value: null }
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
            ...(eventScore.value === null ? {} : { is_event: { type: 'noul', noul: eventScore.value } }),
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
  return { env, state: base.state, calls, linked, confirm, eventScore, warn, cleanup }
}
export type Value = Awaited<ReturnType<typeof setup>>

export const seedEvent = async (
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
export const eventsSnapshot = async (env: Value['env']) =>
  JSON.stringify([
    (await env.DB.prepare('SELECT * FROM events ORDER BY id').all()).results,
    (await env.DB.prepare('SELECT * FROM event_stores ORDER BY id').all()).results
  ])

// screenName は投稿者。既定は秋葉原店の公式アカウント。店舗アカウントでない投稿者を渡すと、投稿アカウントの店舗は決まらない。text は投稿の本文（既定は終了の投稿）。
export const judge = async (
  value: Value,
  id: string,
  stores: string[] = ['akiba'],
  screenName = 'bic_akiba',
  text = ENDED
) => {
  const post = { ...makePost(id, text), screenName, url: `https://x.com/${screenName}/status/${id}` }
  await insertWebhookJob(value.env, post)
  await processWebhookJob(value.env, post.id, {
    extractor: async () => ({ events: [{ item: '限定名刺', stores, characterIds: ['akiba'], evidence: [text] }] })
  })
  return post
}
export const candidateOf = async (value: Value, postId: string) => {
  const job = await getWebhookJob(value.env, postId)
  expect(job.candidates).toHaveLength(1)
  return job.candidates[0]
}
