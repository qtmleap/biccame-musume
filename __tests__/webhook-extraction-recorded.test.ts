import { expect, spyOn, test } from 'bun:test'
import * as discord from '@api/services/discord'
import { getWebhookJob, insertWebhookJob } from '@api/services/webhook-jobs'
import { processWebhookJob } from '@api/services/webhook-process'
import { ClefRequestSchema } from '@biccame/shared/event-detect/clef'
import recorded from '../packages/shared/src/event-detect/extraction-recorded.fixture.json'
import { DetectPostSchema } from '../packages/shared/src/event-detect/post'
import { answer, fixture, migrate } from './fixtures/webhook-multiple-events'

// 保存済み6応答を一時D1へ再生する。外部モデル・通知・本番DBは使わない。
test('実応答の復元候補は件数不明の確認を保持し、破損応答は失敗のまま登録しない', async () => {
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
          expect(candidate.reasons).toContain('distribution_item_count_unknown')
          expect(candidate.status).not.toBe('registered')
          expect(candidate.eventId).toBeNull()
        }
      }
    }
    expect(await env.DB.prepare('SELECT COUNT(*) AS total FROM events').first<number>('total')).toBe(0)
    expect(await env.DB.prepare('SELECT COUNT(*) AS total FROM social_post_jobs').first<number>('total')).toBe(0)
    // 保留の管理通知だけをモックで受け、実通信や登録投稿は発生させない。
    expect(notify).toHaveBeenCalledTimes(5)
    expect(fetchGuard).not.toHaveBeenCalled()
  } finally {
    fetchGuard.mockRestore()
    notify.mockRestore()
    await cleanup()
  }
}, 60000)
