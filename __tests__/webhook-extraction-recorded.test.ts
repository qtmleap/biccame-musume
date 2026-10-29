import { expect, spyOn, test } from 'bun:test'
import * as discord from '@api/services/discord'
import { getWebhookJob, insertWebhookJob } from '@api/services/webhook-jobs'
import { processWebhookJob } from '@api/services/webhook-process'
import { ClefRequestSchema } from '@biccame/shared/event-detect/clef'
import recorded from '../packages/shared/src/event-detect/extraction-recorded.fixture.json'
import { DetectPostSchema } from '../packages/shared/src/event-detect/post'
import { answer, fixture, migrate } from './fixtures/webhook-multiple-events'

// 保存済み6応答を一時D1へ再生する。外部モデル・通知・本番DBは使わない。
test('実応答の復元候補は件数不明でも件数を理由に保留せず、ほかの条件で決まる。破損応答は失敗のまま登録しない', async () => {
  const { env, cleanup } = await fixture('recorded-extraction-errors')
  const notify = spyOn(discord, 'notifyEventDetection').mockImplementation(async () => ({
    status: 'sent',
    messageId: '1234567890'
  }))
  const fetchGuard = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async () => {
        throw new Error('Real fetch forbidden in recorded extraction replay')
      },
      { preconnect: () => {} }
    )
  )
  const configured = Object.assign(env, {
    ANTHROPIC_BASE_URL: 'https://recorded.example.test',
    ANTHROPIC_AUTH_TOKEN: 'synthetic-recorded-token',
    AI: {
      run: async (_model: string, input: unknown) => {
        const request = ClefRequestSchema.safeParse(input)
        if (!request.success) throw new Error('Invalid synthetic detection request')
        if (request.data.questions.distribution_item_count)
          return {
            answers: {
              distribution_item_count: { type: 'choice', choice: 'unknown', probabilities: { unknown: 0.99 } }
            }
          }
        return answer(request.data)
      }
    }
  })
  try {
    await migrate(env.DB)
    const statuses: string[] = []
    for (const entry of recorded) {
      const post = DetectPostSchema.safeParse(entry.post)
      if (!post.success) throw new Error('Invalid recorded post')
      await insertWebhookJob(configured, post.data)
      const extractionFetcher = async () =>
        Response.json({ content: [{ type: 'tool_use', name: 'answer', input: entry.input }] })
      const run = () =>
        processWebhookJob(configured, post.data.id, {
          extractionFetcher,
          titleFetcher: async () =>
            Response.json({ content: [{ type: 'tool_use', name: 'answer', input: { title: '確認候補' } }] })
        })
      if (entry.previousError === 'Invalid event extraction') {
        await expect(run()).rejects.toThrow('Invalid event extraction')
        const saved = await getWebhookJob(env, post.data.id)
        expect(saved.lastError).toBe('extraction_invalid_response')
        expect(saved.status).toBe('failed')
        expect(saved.candidates).toEqual([])
      } else {
        await run()
        const saved = await getWebhookJob(env, post.data.id)
        expect(saved.candidates.length).toBe(
          entry.previousError === 'Duplicate event extraction' ? 1 : entry.input.events.length
        )
        for (const candidate of saved.candidates) {
          // 件数が不明（Clef の回答は unknown 0.99）でも、理由にも総括の理由にも出さない。登録するかは、ほかの条件だけで決まる。
          expect(candidate.reasons.some((reason) => reason.startsWith('distribution_item_count_'))).toBe(false)
          expect(candidate.reasons).not.toContain('auto_registration_not_allowed')
          expect(candidate.eventId === null).toBe(candidate.status !== 'registered')
          statuses.push(candidate.status)
        }
      }
    }
    // 件数不明の回答を付けても、決まる状態はほかの条件（購入額・開始日・条件の組み合わせ・キーワード）だけ。登録まで進むのは1件。
    expect(statuses).toEqual(['held', 'ignored', 'held', 'registered', 'held', 'held', 'ignored'])
    const registered = statuses.filter((status) => status === 'registered').length
    expect(await env.DB.prepare('SELECT COUNT(*) AS total FROM events').first<number>('total')).toBe(registered)
    expect(await env.DB.prepare('SELECT COUNT(*) AS total FROM social_post_jobs').first<number>('total')).toBe(0)
    // 管理通知（保留4件と登録1件）だけをモックで受け、実通信や登録投稿は発生させない。
    expect(notify).toHaveBeenCalledTimes(5)
    expect(fetchGuard).not.toHaveBeenCalled()
  } finally {
    fetchGuard.mockRestore()
    notify.mockRestore()
    await cleanup()
  }
}, 60000)
