import { expect, test } from 'bun:test'
import { rejudgeWebhookJob } from '@api/services/webhook-admin'
import { ClefRequestSchema, ClefResponseSchema } from '@biccame/shared/event-detect/clef'
import { LINKED_EVENT_QUESTION_KEY } from '@biccame/shared/event-detect/detection'
import { getWebhookJob, judgeSingle, rejudgeHarness, rowOf, storedResult } from './fixtures/webhook-rejudge-registered'

test('登録済みの再実行は、再判定の結果が終了でも 3 段目（連携先の提案）を聞かず、提案を保存しない', async () => {
  const { env, cleanup, ai } = await rejudgeHarness('linked-event-rejudge-registered')
  try {
    const post = await judgeSingle(env, '2109221721773589001')
    const stamp = '2026-10-01T00:00:00.000+00:00'
    // 秋葉原に、提案の候補になりうる未終了のイベントがある状態にする（候補が無いから聞かない、という理由で通らないように）。
    const eventId = '550e8400-e29b-41d4-a716-446655440201'
    await env.DB.prepare('INSERT INTO events(id,category,title,start_date,updated_at) VALUES (?,?,?,?,?)')
      .bind(eventId, 'limited_card', '未終了の既存イベント', stamp, stamp)
      .run()
    await env.DB.prepare('INSERT INTO event_stores(id,event_id,store_key,updated_at) VALUES (?,?,?,?)')
      .bind(crypto.randomUUID(), eventId, 'akiba', stamp)
      .run()
    const before = await getWebhookJob(env, post.id)
    expect(before.status).toBe('registered')
    const candidateId = before.candidates[0].eventUUID
    // 再判定の AI は status を終了と答える。3 段目の質問が飛んできたら数える。
    const inner = env.AI
    const linkedCalls: string[] = []
    Object.assign(env, {
      AI: {
        run: async (model: string, raw: unknown) => {
          const request = ClefRequestSchema.safeParse(raw)
          if (!request.success) throw new Error('Invalid request')
          if (request.data.questions[LINKED_EVENT_QUESTION_KEY] !== undefined) {
            linkedCalls.push(request.data.state)
            throw new Error('Unexpected linked event request')
          }
          const response = ClefResponseSchema.safeParse(await inner.run(model, raw))
          if (!response.success) throw new Error('Invalid fake response')
          if (request.data.questions.is_event === undefined) return response.data
          return {
            answers: {
              ...response.data.answers,
              // 再判定の既定の is_event（0.8123）は登録のしきい値未満で review になるので、検出済みの end になるよう高くする。
              is_event: { type: 'noul', noul: 0.99 },
              status: { type: 'choice', choice: 'end', probabilities: { end: 0.99 } }
            }
          }
        }
      }
    })
    ai.state.armed = true
    const job = await rejudgeWebhookJob(env, post.id)
    expect(ai.state.calls.length).toBeGreaterThan(0)
    expect(linkedCalls).toEqual([])
    const stored = storedResult(await rowOf(env, 'webhook_event_candidates', 'event_uuid', candidateId))
    // 再判定の結果は終了だが、提案は付かない。登録済みのまま、イベントも変えない。
    expect(stored.discovery.action).toBe('end')
    expect(stored.discovery.linkedEvent).toBeUndefined()
    expect(job.candidates[0].discovery?.linkedEvent).toBeUndefined()
    expect(job.status).toBe('registered')
    expect(job.candidates[0].eventId).toBe(before.candidates[0].eventId)
  } finally {
    await cleanup()
  }
}, 60000)
