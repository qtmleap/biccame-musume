import { afterEach, describe, expect, setSystemTime, spyOn, test } from 'bun:test'
import { rejudgeWebhookJob } from '@api/services/webhook-admin'
import * as webhookJobs from '@api/services/webhook-jobs'
import { WEBHOOK_STALLED_MS } from '@biccame/shared/domain/webhook-stalled'
import dayjs from 'dayjs'
import { conflictOf, heldSeed, rawRejudgeRow, seedRejudgeJob, withRejudgeEnv } from './fixtures/webhook-d1-jobs'
import { judging, NOW, OLD } from './fixtures/webhook-stalled'

// 画面の「再実行」が、止まっている処理待ち・処理中（queued / processing で、60 分以上動いておらずリース中でない）も受け付ける。
// 新しい処理待ち・処理中とリース中は、これまでどおり 409。候補の再実行は webhook-stalled-rejudge-candidates.test.ts。

describe('止まっている処理待ち・処理中の再実行（単一のジョブ）', () => {
  afterEach(() => setSystemTime())

  test.each(['queued', 'processing'] as const)(
    '止まっている %s のジョブは queued に戻り、保存済みの回答・判定結果・エラー・リースを消して 1 回だけキューへ積む',
    async (status) => {
      await withRejudgeEnv(async (env, sent) => {
        const postId = await seedRejudgeJob(env, 1, judging(status))
        const before = await rawRejudgeRow(env, postId)
        const startedAt = dayjs().valueOf()
        const job = await rejudgeWebhookJob(env, postId)
        expect(job).toMatchObject({
          postId,
          status: 'queued',
          reasons: [],
          candidate: null,
          answers: null,
          confidence: null,
          model: null,
          judgedAt: null,
          notificationStatus: 'pending',
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
        // 更新時刻は現在に進み、止まっている扱いが解ける（積み直した直後の再押下は 409）。
        const updatedAt = (await rawRejudgeRow(env, postId))?.updated_at
        expect(updatedAt).toBeGreaterThanOrEqual(startedAt)
        expect(updatedAt).not.toBe(before?.updated_at)
        expect(sent).toEqual([postId])
        expect(await conflictOf(rejudgeWebhookJob(env, postId))).toEqual({
          status: 409,
          message: 'This job cannot be re-judged'
        })
        expect(sent).toEqual([postId])
      })
    },
    60000
  )

  test('境界: ちょうど 60 分動いていないジョブは受け付け、1 ミリ秒でも新しいジョブは 409 で何も変えない', async () => {
    await withRejudgeEnv(async (env, sent) => {
      const exact = await seedRejudgeJob(env, 1, judging('queued', { updatedAt: NOW - WEBHOOK_STALLED_MS }))
      const newer = await seedRejudgeJob(env, 2, judging('queued', { updatedAt: NOW - WEBHOOK_STALLED_MS + 1 }))
      const newerBefore = await rawRejudgeRow(env, newer)
      setSystemTime(new Date(NOW))
      expect((await rejudgeWebhookJob(env, exact)).status).toBe('queued')
      expect((await rawRejudgeRow(env, exact))?.updated_at).toBe(NOW)
      expect(await conflictOf(rejudgeWebhookJob(env, newer))).toEqual({
        status: 409,
        message: 'This job cannot be re-judged'
      })
      expect(await rawRejudgeRow(env, newer)).toEqual(newerBefore)
      expect(sent).toEqual([exact])
    })
  }, 60000)

  test('新しい queued / processing は 409 で、何も変えず積まない（従来どおり）', async () => {
    await withRejudgeEnv(async (env, sent) => {
      for (const [index, status] of (['queued', 'processing'] as const).entries()) {
        const postId = await seedRejudgeJob(env, index + 1, judging(status, { updatedAt: dayjs().valueOf() - 60_000 }))
        const before = await rawRejudgeRow(env, postId)
        expect(await conflictOf(rejudgeWebhookJob(env, postId))).toEqual({
          status: 409,
          message: 'This job cannot be re-judged'
        })
        expect(await rawRejudgeRow(env, postId)).toEqual(before)
      }
      expect(sent).toEqual([])
    })
  }, 60000)

  test('リース中の queued / processing は、古くても 409 で何も変えない（リースを奪わない）', async () => {
    await withRejudgeEnv(async (env, sent) => {
      for (const [index, status] of (['queued', 'processing'] as const).entries()) {
        const postId = await seedRejudgeJob(
          env,
          index + 1,
          judging(status, { leaseUntil: dayjs().valueOf() + 300_000 })
        )
        const before = await rawRejudgeRow(env, postId)
        expect(await conflictOf(rejudgeWebhookJob(env, postId))).toEqual({
          status: 409,
          message: 'Job is being processed'
        })
        expect(await rawRejudgeRow(env, postId)).toEqual(before)
      }
      // 期限が切れたリースは、止まっている扱いのまま受け付ける。
      const expired = await seedRejudgeJob(env, 3, judging('processing', { leaseUntil: dayjs().valueOf() - 1000 }))
      expect((await rejudgeWebhookJob(env, expired)).status).toBe('queued')
      expect(await rawRejudgeRow(env, expired)).toMatchObject({ lease_token: null, lease_until: null })
      expect(sent).toEqual([expired])
    })
  }, 60000)

  test('判定から更新までの間に処理が再開（updated_at が進む）したら、更新が空振りして 409 になり、新しい処理を壊さない', async () => {
    await withRejudgeEnv(async (env, sent) => {
      const postId = await seedRejudgeJob(env, 1, judging('processing'))
      const original = webhookJobs.getWebhookJob
      const reads: string[] = []
      // rejudgeWebhookJob は更新の前に getWebhookJob を 2 回読む（親、操作の対象）。最後の読み取りの直後に、別の処理が再開して
      // updated_at を進めた状態を作る（読み取り後・更新前の競合）。読み取った内容は止まっている古い値のまま返す。
      const resumed = spyOn(webhookJobs, 'getWebhookJob').mockImplementation(async (database, id) => {
        const read = await original(database, id)
        reads.push(id)
        if (reads.length === 2)
          await database.DB.prepare('UPDATE webhook_event_jobs SET updated_at=? WHERE post_id=?')
            .bind(dayjs().valueOf(), id)
            .run()
        return read
      })
      try {
        expect(await conflictOf(rejudgeWebhookJob(env, postId))).toEqual({
          status: 409,
          message: 'Job is being processed'
        })
      } finally {
        resumed.mockRestore()
      }
      expect(reads).toEqual([postId, postId])
      const after = await rawRejudgeRow(env, postId)
      // 再実行は何も消しておらず、再開した処理の結果と状態がそのまま残る。
      expect(after).toMatchObject({ status: 'processing', answers_json: '{"is_event":{"type":"noul","noul":0.72}}' })
      expect(sent).toEqual([])
    })
  }, 60000)

  test('止まっていても、処理待ち・処理中以外の規則は変わらない（人の却下は 409、自動登録済みは queued に戻さない）', async () => {
    await withRejudgeEnv(async (env, sent) => {
      const rejected = await seedRejudgeJob(env, 1, {
        ...heldSeed,
        status: 'failed',
        reasons: ['manually_rejected'],
        updatedAt: OLD
      })
      expect(await conflictOf(rejudgeWebhookJob(env, rejected))).toEqual({
        status: 409,
        message: 'Manually rejected jobs cannot be re-judged'
      })
      // 人が却下したまま queued になった行は無い想定だが、queued でも reasons の manually_rejected は上書きしない扱いを保つ。
      expect(sent).toEqual([])
    })
  }, 60000)
})
