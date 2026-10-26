import { describe, expect, test } from 'bun:test'
import { rejudgeWebhookJob, resolveWebhookJob } from '@api/services/webhook-admin'
import { claimWebhookJob } from '@api/services/webhook-jobs'
import {
  conflictOf,
  event,
  heldSeed,
  ignoredSeed,
  rawRejudgeRow,
  rejectedSeed,
  seedRejudgeJob,
  withRejudgeEnv
} from './fixtures/webhook-d1-jobs'
import {
  announceUrls,
  autoRegisteredSeed,
  eventSnapshot,
  insertAnnounce,
  insertEvent,
  linkedSeed
} from './fixtures/webhook-relink'

const sourceUrlOf = (postId: string) => `https://x.com/bic_akiba/status/${postId}`

describe('登録済みジョブの連携し直し', () => {
  test('手動連携した登録済みジョブを別イベントへ付け替える。元のイベントと参照URLは変えず、通知の状態も変えない', async () => {
    await withRejudgeEnv(async (env) => {
      await insertEvent(env, event.uuid, '元の連携先')
      for (const [index, notificationStatus] of ['sent', 'failed', 'unknown', 'pending'].entries()) {
        const postId = await seedRejudgeJob(env, index + 1, { ...linkedSeed, notificationStatus })
        // 手動で作ったイベントに、元から同じ投稿URLが付いている場合。
        await insertAnnounce(env, event.uuid, sourceUrlOf(postId))
        const nextId = crypto.randomUUID()
        await insertEvent(env, nextId, '新しい連携先')
        const oldBefore = await eventSnapshot(env, event.uuid)
        const job = await resolveWebhookJob(env, postId, { action: 'link', eventId: nextId })
        expect(job).toMatchObject({
          status: 'registered',
          eventId: nextId,
          reasons: ['manually_linked'],
          notificationStatus,
          notificationAttempts: 2
        })
        expect(await rawRejudgeRow(env, postId)).toMatchObject({
          status: 'registered',
          event_id: nextId,
          reasons_json: '["manually_linked"]',
          notification_status: notificationStatus,
          notification_error: 'previous notification error',
          notification_id: 'message-1',
          notification_attempts: 2,
          attempts: 3,
          lease_token: null,
          lease_until: null
        })
        expect(await eventSnapshot(env, event.uuid)).toBe(oldBefore)
        expect(await announceUrls(env, nextId)).toEqual([sourceUrlOf(postId)])
      }
    })
  }, 60000)

  test('通知済みの登録済みジョブを付け替えても、処理側は通知のために取得しない（再通知しない）', async () => {
    await withRejudgeEnv(async (env) => {
      const postId = await seedRejudgeJob(env, 1, linkedSeed)
      const nextId = crypto.randomUUID()
      await insertEvent(env, nextId, '新しい連携先')
      await resolveWebhookJob(env, postId, { action: 'link', eventId: nextId })
      expect(await claimWebhookJob(env, postId)).toBeNull()
    })
  }, 60000)

  // 自動登録済みの再実行は 409 ではなく、登録を変えずに判定だけをやり直す（webhook-rejudge-registered.test.ts）。
  test('自動登録された登録済みジョブ（manually_linked なし）も付け替えられ、付け替えると手動連携として扱われる', async () => {
    await withRejudgeEnv(async (env, sent) => {
      await insertEvent(env, event.uuid, 'パイプラインが作ったイベント')
      const postId = await seedRejudgeJob(env, 1, autoRegisteredSeed)
      expect(sent).toEqual([])
      const oldBefore = await eventSnapshot(env, event.uuid)
      const nextId = crypto.randomUUID()
      await insertEvent(env, nextId, '正しい連携先')
      const job = await resolveWebhookJob(env, postId, { action: 'link', eventId: nextId })
      expect(job).toMatchObject({ status: 'registered', eventId: nextId, reasons: ['manually_linked'] })
      expect(await rawRejudgeRow(env, postId)).toMatchObject({ notification_status: 'sent', notification_attempts: 2 })
      expect(await eventSnapshot(env, event.uuid)).toBe(oldBefore)
    })
  }, 60000)

  test('存在しないイベント・処理中リースは拒否し、登録済みのまま何も変えない。登録と却下は登録済みに使えない', async () => {
    await withRejudgeEnv(async (env, sent) => {
      const postId = await seedRejudgeJob(env, 1, linkedSeed)
      const before = await rawRejudgeRow(env, postId)
      await expect(
        resolveWebhookJob(env, postId, { action: 'link', eventId: crypto.randomUUID() })
      ).rejects.toMatchObject({ status: 404 })
      const message = 'Job cannot be resolved with this action'
      expect(await conflictOf(resolveWebhookJob(env, postId, { action: 'reject' }))).toEqual({ status: 409, message })
      expect(await conflictOf(resolveWebhookJob(env, postId, { action: 'register', event }))).toEqual({
        status: 409,
        message
      })
      const nextId = crypto.randomUUID()
      await insertEvent(env, nextId, '新しい連携先')
      await env.DB.prepare('UPDATE webhook_event_jobs SET lease_token=?,lease_until=? WHERE post_id=?')
        .bind('other-worker', 9999999999999, postId)
        .run()
      expect(await conflictOf(resolveWebhookJob(env, postId, { action: 'link', eventId: nextId }))).toEqual({
        status: 409,
        message: 'Job is being processed'
      })
      expect(await rawRejudgeRow(env, postId)).toEqual({
        ...before,
        lease_token: 'other-worker',
        lease_until: 9999999999999
      })
      expect(await announceUrls(env, nextId)).toEqual([])
      expect(sent).toEqual([])
    })
  }, 60000)

  test('保留・対象外からの初回連携は従来どおり通知待ち(pending)になり、通知エラーを消す。却下は skipped', async () => {
    await withRejudgeEnv(async (env) => {
      for (const [index, seed] of [heldSeed, ignoredSeed, rejectedSeed].entries()) {
        const postId = await seedRejudgeJob(env, index + 1, seed)
        const nextId = crypto.randomUUID()
        await insertEvent(env, nextId, '連携先')
        const job = await resolveWebhookJob(env, postId, { action: 'link', eventId: nextId })
        expect(job).toMatchObject({
          status: 'registered',
          eventId: nextId,
          reasons: ['manually_linked'],
          notificationStatus: 'pending',
          notificationError: null
        })
        expect(await announceUrls(env, nextId)).toEqual([sourceUrlOf(postId)])
      }
      const heldId = await seedRejudgeJob(env, 4, heldSeed)
      expect(await resolveWebhookJob(env, heldId, { action: 'reject' })).toMatchObject({
        status: 'ignored',
        eventId: null,
        reasons: ['manually_rejected'],
        notificationStatus: 'skipped',
        notificationError: null
      })
    })
  }, 60000)
})

describe('登録済みジョブの判定し直し', () => {
  test('手動連携した登録済みジョブは queued に戻り、event_id と判定結果が消える。連携先のイベントは変えない', async () => {
    await withRejudgeEnv(async (env, sent) => {
      await insertEvent(env, event.uuid, '誤って連携したイベント')
      const postId = await seedRejudgeJob(env, 1, linkedSeed)
      await insertAnnounce(env, event.uuid, sourceUrlOf(postId))
      const oldBefore = await eventSnapshot(env, event.uuid)
      const job = await rejudgeWebhookJob(env, postId)
      expect(job).toMatchObject({
        status: 'queued',
        eventId: null,
        reasons: [],
        candidate: null,
        answers: null,
        confidence: null,
        notificationStatus: 'pending',
        notificationError: null
      })
      expect(await rawRejudgeRow(env, postId)).toMatchObject({
        status: 'queued',
        event_id: null,
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
        lease_token: null,
        lease_until: null,
        attempts: 3,
        notification_attempts: 2
      })
      expect(await eventSnapshot(env, event.uuid)).toBe(oldBefore)
      expect(sent).toEqual([postId])
      expect(await claimWebhookJob(env, postId)).toEqual(expect.any(String))
    })
  }, 60000)

  test('保留・対象外の再判定は event_id を触らない（従来どおり）', async () => {
    await withRejudgeEnv(async (env) => {
      for (const [index, seed] of [heldSeed, ignoredSeed].entries()) {
        const postId = await seedRejudgeJob(env, index + 1, seed)
        await rejudgeWebhookJob(env, postId)
        expect(await rawRejudgeRow(env, postId)).toMatchObject({ status: 'queued', event_id: event.uuid })
      }
    })
  }, 60000)

  // manually_linked を部分一致で含むだけの理由の登録済みは、手動連携ではなく自動登録済みとして扱う（webhook-rejudge-registered-guards.test.ts）。
  test('人の却下・処理中リースは 409 で何も変えない', async () => {
    await withRejudgeEnv(async (env, sent) => {
      const cases = [
        {
          seed: { ...linkedSeed, reasons: ['manually_rejected'] },
          message: 'Manually rejected jobs cannot be re-judged'
        },
        { seed: rejectedSeed, message: 'Manually rejected jobs cannot be re-judged' },
        { seed: { ...linkedSeed, leaseUntil: 9999999999999 }, message: 'Job is being processed' }
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

  test('付け替え直後の手動連携ジョブは判定し直せ、元の連携先を外して連携先のイベントは残る', async () => {
    await withRejudgeEnv(async (env) => {
      await insertEvent(env, event.uuid, '元の連携先')
      const postId = await seedRejudgeJob(env, 1, autoRegisteredSeed)
      const nextId = crypto.randomUUID()
      await insertEvent(env, nextId, '付け替え先')
      await resolveWebhookJob(env, postId, { action: 'link', eventId: nextId })
      const nextBefore = await eventSnapshot(env, nextId)
      const job = await rejudgeWebhookJob(env, postId)
      expect(job).toMatchObject({ status: 'queued', eventId: null })
      expect(await eventSnapshot(env, nextId)).toBe(nextBefore)
    })
  }, 60000)
})
