import { afterEach, describe, expect, setSystemTime, test } from 'bun:test'
import { rejudgeWebhookJob } from '@api/services/webhook-admin'
import { getWebhookJob } from '@api/services/webhook-jobs'
import { WEBHOOK_STALLED_MS } from '@biccame/shared/domain/webhook-stalled'
import dayjs from 'dayjs'
import { conflictOf, rawRejudgeRow, withRejudgeEnv } from './fixtures/webhook-d1-jobs'
import { candidateRow, seedCandidate } from './fixtures/webhook-relink'
import { childId, NOW, OLD, oldEvent, seedStalledPair, siblingId } from './fixtures/webhook-stalled'

// 止まっている処理待ち・処理中の「候補」の再実行（親ジョブが failed のまま候補が queued で止まる、実例の形を含む）。単一のジョブは webhook-stalled-rejudge.test.ts。

describe('止まっている処理待ち・処理中の再実行（候補）', () => {
  afterEach(() => setSystemTime())

  test('実例の形（親が failed、候補が queued で止まっている）: 候補を queued に戻し、親も queued にして 1 回だけ積む', async () => {
    await withRejudgeEnv(async (env, sent) => {
      const postId = await seedStalledPair(env, 1)
      const job = await rejudgeWebhookJob(env, postId, childId)
      expect(job.status).toBe('queued')
      expect(job.candidates.map((candidate) => candidate.status)).toEqual(['queued'])
      expect(await candidateRow(env, childId)).toMatchObject({
        status: 'queued',
        result_json: null,
        answers_json: null,
        candidate_json: null,
        reasons_json: '[]',
        confidence: null,
        model: null,
        question_version: null,
        judged_at: null,
        semantic_key: null,
        notification_status: 'pending',
        notification_error: null,
        last_error: null,
        // 処理回数は巻き戻さない。
        attempts: 9,
        lease_token: null,
        lease_until: null
      })
      expect(await rawRejudgeRow(env, postId)).toMatchObject({ status: 'queued', lease_token: null, lease_until: null })
      expect(sent).toEqual([postId])
      // 積み直した直後は更新時刻が現在に進むので、続けて押しても 409（二重に積まない）。
      expect(await conflictOf(rejudgeWebhookJob(env, postId, childId))).toEqual({
        status: 409,
        message: 'Candidate cannot be re-judged'
      })
      expect(sent).toEqual([postId])
    })
  }, 60000)

  test('候補を指定しなくても、候補が 1 件ならその候補（actionJob の流儀）で再実行できる', async () => {
    await withRejudgeEnv(async (env, sent) => {
      const postId = await seedStalledPair(env, 1)
      expect((await rejudgeWebhookJob(env, postId)).status).toBe('queued')
      expect((await candidateRow(env, childId))?.status).toBe('queued')
      expect(sent).toEqual([postId])
    })
  }, 60000)

  test('止まっている processing の候補も再実行できる。ほかの候補は変えない', async () => {
    await withRejudgeEnv(async (env, sent) => {
      const postId = await seedStalledPair(env, 1, 'processing')
      await seedCandidate(env, postId, {
        uuid: siblingId,
        status: 'registered',
        reasons: ['title_generated'],
        eventId: oldEvent,
        notificationStatus: 'sent',
        createdAt: 1791676800001
      })
      const siblingBefore = await candidateRow(env, siblingId)
      await rejudgeWebhookJob(env, postId, childId)
      expect((await candidateRow(env, childId))?.status).toBe('queued')
      expect(await candidateRow(env, siblingId)).toEqual(siblingBefore)
      expect(sent).toEqual([postId])
    })
  }, 60000)

  test('新しい queued / processing の候補は 409 で、何も変えない', async () => {
    await withRejudgeEnv(async (env, sent) => {
      for (const [index, status] of (['queued', 'processing'] as const).entries()) {
        const postId = await seedStalledPair(env, index + 1, status)
        await env.DB.prepare('UPDATE webhook_event_candidates SET updated_at=? WHERE event_uuid=?')
          .bind(dayjs().valueOf() - 60_000, childId)
          .run()
        const parentBefore = await rawRejudgeRow(env, postId)
        const childBefore = await candidateRow(env, childId)
        expect(await conflictOf(rejudgeWebhookJob(env, postId, childId))).toEqual({
          status: 409,
          message: 'Candidate cannot be re-judged'
        })
        expect(await rawRejudgeRow(env, postId)).toEqual(parentBefore)
        expect(await candidateRow(env, childId)).toEqual(childBefore)
        await env.DB.prepare('DELETE FROM webhook_event_candidates WHERE event_uuid=?').bind(childId).run()
      }
      expect(sent).toEqual([])
    })
  }, 60000)

  test('境界: ちょうど 60 分動いていない候補は受け付け、1 ミリ秒でも新しい候補は 409', async () => {
    await withRejudgeEnv(async (env, sent) => {
      const exact = await seedStalledPair(env, 1)
      await env.DB.prepare('UPDATE webhook_event_candidates SET updated_at=? WHERE event_uuid=?')
        .bind(NOW - WEBHOOK_STALLED_MS, childId)
        .run()
      setSystemTime(new Date(NOW))
      expect((await rejudgeWebhookJob(env, exact, childId)).status).toBe('queued')
      await env.DB.prepare('DELETE FROM webhook_event_candidates WHERE event_uuid=?').bind(childId).run()
      const newer = await seedStalledPair(env, 2)
      await env.DB.prepare('UPDATE webhook_event_candidates SET updated_at=? WHERE event_uuid=?')
        .bind(NOW - WEBHOOK_STALLED_MS + 1, childId)
        .run()
      expect(await conflictOf(rejudgeWebhookJob(env, newer, childId))).toEqual({
        status: 409,
        message: 'Candidate cannot be re-judged'
      })
      expect(sent).toEqual([exact])
    })
  }, 60000)

  test('リース中の候補は 409 で、何も変えない。リースも残さない', async () => {
    await withRejudgeEnv(async (env, sent) => {
      const postId = await seedStalledPair(env, 1, 'processing')
      await env.DB.prepare(
        "UPDATE webhook_event_candidates SET lease_token='other-worker',lease_until=? WHERE event_uuid=?"
      )
        .bind(dayjs().valueOf() + 300_000, childId)
        .run()
      const parentBefore = await rawRejudgeRow(env, postId)
      const childBefore = await candidateRow(env, childId)
      expect(await conflictOf(rejudgeWebhookJob(env, postId, childId))).toEqual({
        status: 409,
        message: 'Candidate is being processed'
      })
      expect(await candidateRow(env, childId)).toEqual(childBefore)
      // 親のロックは取ったあと戻す。親の状態もリースも元のまま。
      expect(await rawRejudgeRow(env, postId)).toMatchObject({
        status: parentBefore?.status,
        lease_token: null,
        lease_until: null
      })
      expect(sent).toEqual([])
    })
  }, 60000)

  test('親のジョブがリース中（処理が動いている）なら、候補が古くても 409', async () => {
    await withRejudgeEnv(async (env, sent) => {
      const postId = await seedStalledPair(env, 1, 'processing')
      await env.DB.prepare("UPDATE webhook_event_jobs SET lease_token='other-worker',lease_until=? WHERE post_id=?")
        .bind(dayjs().valueOf() + 300_000, postId)
        .run()
      const childBefore = await candidateRow(env, childId)
      expect(await conflictOf(rejudgeWebhookJob(env, postId, childId))).toEqual({
        status: 409,
        message: 'Job is being processed'
      })
      expect(await candidateRow(env, childId)).toEqual(childBefore)
      expect(sent).toEqual([])
    })
  }, 60000)

  test('旧形式（legacy-single）: 止まっている候補を消して、親ジョブを抽出前の queued に戻す', async () => {
    await withRejudgeEnv(async (env, sent) => {
      const postId = await seedStalledPair(env, 1)
      await env.DB.prepare('UPDATE webhook_event_jobs SET extraction_json=? WHERE post_id=?')
        .bind('{"version":"legacy-single"}', postId)
        .run()
      const job = await rejudgeWebhookJob(env, postId, childId)
      expect(job.status).toBe('queued')
      expect(job.candidates).toHaveLength(0)
      expect(await candidateRow(env, childId)).toBeNull()
      expect(await rawRejudgeRow(env, postId)).toMatchObject({
        status: 'queued',
        extraction_json: null,
        result_json: null,
        last_error: null,
        lease_token: null,
        lease_until: null
      })
      expect(sent).toEqual([postId])
    })
  }, 60000)

  test('親が failed のまま、親ジョブだけ（候補を指定しない）を再実行する経路は、候補が 2 件以上なら 409（選択が必要）', async () => {
    await withRejudgeEnv(async (env, sent) => {
      const postId = await seedStalledPair(env, 1)
      await seedCandidate(env, postId, {
        uuid: siblingId,
        status: 'queued',
        reasons: [],
        eventId: null,
        notificationStatus: 'pending',
        createdAt: 1791676800001,
        updatedAt: OLD
      })
      expect(await conflictOf(rejudgeWebhookJob(env, postId))).toEqual({
        status: 409,
        message: 'Select a webhook candidate'
      })
      expect((await getWebhookJob(env, postId)).candidates.map((candidate) => candidate.status)).toEqual([
        'queued',
        'queued'
      ])
      expect(sent).toEqual([])
    })
  }, 60000)
})
