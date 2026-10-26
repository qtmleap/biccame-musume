import { describe, expect, test } from 'bun:test'
import { rejudgeWebhookJob } from '@api/services/webhook-admin'
import { getWebhookJob } from '@api/services/webhook-jobs'
import {
  conflictOf,
  heldSeed,
  rawRejudgeRow,
  rejectedSeed,
  seedRejudgeJob,
  withRejudgeEnv
} from './fixtures/webhook-d1-jobs'
import { candidateRow, seedCandidate } from './fixtures/webhook-relink'

// 画面の「再実行」は rejudgeWebhookJob を呼ぶ。処理に失敗したジョブも、保留と同じく保存済みの回答と判定結果を消して最初からやり直す。
const failedSeed = { ...heldSeed, status: 'failed', notificationStatus: 'pending', reasons: [] }
const failedId = '11111111-1111-4111-8111-111111111111'
const registeredId = '22222222-2222-4222-8222-222222222222'
const oldEvent = '33333333-3333-4333-8333-333333333333'

/** 失敗した候補（先頭）と、自動登録された候補を親ジョブの下に並べる。 */
const seedFailedPair = async (env: Parameters<Parameters<typeof withRejudgeEnv>[0]>[0], index: number) => {
  const postId = await seedRejudgeJob(env, index, { ...failedSeed, notificationStatus: 'sent' })
  await seedCandidate(env, postId, {
    uuid: failedId,
    status: 'failed',
    reasons: [],
    eventId: null,
    notificationStatus: 'pending',
    createdAt: 1791676800000
  })
  await seedCandidate(env, postId, {
    uuid: registeredId,
    status: 'registered',
    reasons: ['title_generated'],
    eventId: oldEvent,
    notificationStatus: 'sent',
    createdAt: 1791676800001
  })
  return postId
}

describe('処理に失敗したジョブの再実行（rejudgeWebhookJob）', () => {
  test('単一のジョブ: 失敗したジョブを queued に戻し、保存済みの回答・判定結果・エラーを消して 1 回だけキューへ積む', async () => {
    await withRejudgeEnv(async (env, sent) => {
      const postId = await seedRejudgeJob(env, 1, failedSeed)
      const job = await rejudgeWebhookJob(env, postId)
      expect(job).toMatchObject({
        postId,
        status: 'queued',
        reasons: [],
        candidate: null,
        confidence: null,
        model: null,
        questionVersion: null,
        answers: null,
        judgedAt: null,
        notificationStatus: 'pending',
        notificationError: null,
        lastError: null
      })
      expect(await rawRejudgeRow(env, postId)).toMatchObject({
        status: 'queued',
        result_json: null,
        answers_json: null,
        candidate_json: null,
        reasons_json: '[]',
        semantic_key: null,
        last_error: null,
        lease_token: null,
        lease_until: null,
        // 処理回数は巻き戻さない。
        attempts: 3,
        notification_attempts: 2
      })
      expect(sent).toEqual([postId])
    })
  }, 60000)

  test('単一のジョブ: 人が却下した失敗ジョブは 409、処理中のリースがあれば 409 で、何も変えず積まない', async () => {
    await withRejudgeEnv(async (env, sent) => {
      const cases = [
        { seed: { ...rejectedSeed, status: 'failed' }, message: 'Manually rejected jobs cannot be re-judged' },
        { seed: { ...failedSeed, leaseUntil: 9999999999999 }, message: 'Job is being processed' }
      ]
      for (const [index, { seed, message }] of cases.entries()) {
        const postId = await seedRejudgeJob(env, index + 1, seed)
        const before = await rawRejudgeRow(env, postId)
        expect(await conflictOf(rejudgeWebhookJob(env, postId))).toEqual({ status: 409, message })
        expect(await rawRejudgeRow(env, postId)).toEqual(before)
      }
      expect(sent).toEqual([])
    })
  }, 60000)

  test('複数の候補: 失敗した候補だけを queued に戻して回答を消し、他の候補は変えず、親ジョブを queued にする', async () => {
    await withRejudgeEnv(async (env, sent) => {
      const postId = await seedFailedPair(env, 1)
      const registeredBefore = await candidateRow(env, registeredId)
      const job = await rejudgeWebhookJob(env, postId, failedId)
      expect(job.status).toBe('queued')
      expect(await candidateRow(env, failedId)).toMatchObject({
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
        attempts: 3,
        notification_attempts: 2,
        lease_token: null,
        lease_until: null
      })
      expect(await candidateRow(env, registeredId)).toEqual(registeredBefore)
      expect((await getWebhookJob(env, postId)).candidates.map((candidate) => candidate.status)).toEqual([
        'queued',
        'registered'
      ])
      expect(await rawRejudgeRow(env, postId)).toMatchObject({ status: 'queued', lease_token: null, lease_until: null })
      expect(sent).toEqual([postId])
    })
  }, 60000)

  test('複数の候補: 人が却下した失敗の候補は 409 で、何も変えない。リースも残さない', async () => {
    await withRejudgeEnv(async (env, sent) => {
      const postId = await seedFailedPair(env, 1)
      await env.DB.prepare('UPDATE webhook_event_candidates SET reasons_json=? WHERE event_uuid=?')
        .bind(JSON.stringify(['manually_rejected']), failedId)
        .run()
      const parentBefore = await rawRejudgeRow(env, postId)
      const childBefore = await candidateRow(env, failedId)
      expect(await conflictOf(rejudgeWebhookJob(env, postId, failedId))).toEqual({
        status: 409,
        message: 'Candidate cannot be re-judged'
      })
      expect(await rawRejudgeRow(env, postId)).toEqual(parentBefore)
      expect(await candidateRow(env, failedId)).toEqual(childBefore)
      expect(sent).toEqual([])
    })
  }, 60000)

  test('旧形式（legacy-single）: 失敗した候補を消して、親ジョブを抽出前の queued に戻す', async () => {
    await withRejudgeEnv(async (env, sent) => {
      const postId = await seedRejudgeJob(env, 1, failedSeed)
      await env.DB.prepare('UPDATE webhook_event_jobs SET extraction_json=? WHERE post_id=?')
        .bind('{"version":"legacy-single"}', postId)
        .run()
      await seedCandidate(env, postId, {
        uuid: failedId,
        status: 'failed',
        reasons: [],
        eventId: null,
        notificationStatus: 'pending',
        createdAt: 1791676800000
      })
      const job = await rejudgeWebhookJob(env, postId)
      expect(job.status).toBe('queued')
      expect(job.candidates).toHaveLength(0)
      expect(await candidateRow(env, failedId)).toBeNull()
      expect(await rawRejudgeRow(env, postId)).toMatchObject({
        status: 'queued',
        extraction_json: null,
        result_json: null,
        answers_json: null,
        candidate_json: null,
        reasons_json: '[]',
        last_error: null,
        notification_status: 'pending',
        lease_token: null,
        lease_until: null
      })
      expect(sent).toEqual([postId])
    })
  }, 60000)

  test('自動登録された登録済み・処理中・待機中は、これまでどおり 409 のまま（失敗だけが加わった）', async () => {
    await withRejudgeEnv(async (env, sent) => {
      const cases = [
        { ...heldSeed, status: 'registered', reasons: ['title_generated'], notificationStatus: 'sent' },
        { ...heldSeed, status: 'processing', reasons: [], notificationStatus: 'pending' },
        { ...heldSeed, status: 'queued', reasons: [], notificationStatus: 'pending' }
      ]
      for (const [index, seed] of cases.entries()) {
        const postId = await seedRejudgeJob(env, index + 1, seed)
        const before = await rawRejudgeRow(env, postId)
        expect(await conflictOf(rejudgeWebhookJob(env, postId))).toEqual({
          status: 409,
          message: 'Only held or ignored jobs can be re-judged'
        })
        expect(await rawRejudgeRow(env, postId)).toEqual(before)
      }
      expect(sent).toEqual([])
    })
  }, 60000)
})
