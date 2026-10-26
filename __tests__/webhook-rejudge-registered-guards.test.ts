import { describe, expect, test } from 'bun:test'
import { actionJob, rejudgeWebhookJob } from '@api/services/webhook-admin'
import { rejudgeRegisteredWebhookJob } from '@api/services/webhook-rejudge-registered'
import dayjs from 'dayjs'
import { heldSeed, ignoredSeed, rejectedSeed, rejudgePostId, seedRejudgeJob } from './fixtures/webhook-d1-jobs'
import {
  databaseSnapshot,
  expectNoLease,
  getWebhookJob,
  REJUDGED_PROBABILITY,
  registerPair,
  rejudgeHarness,
  rowOf,
  statusOf,
  storedResult,
  unchangedColumns
} from './fixtures/webhook-rejudge-registered'
import { autoRegisteredSeed, linkedSeed } from './fixtures/webhook-relink'

const postIdOf = (index: number) => `210922172177358${String(index).padStart(4, '0')}`

describe('自動登録済みの再実行が拒むもの', () => {
  test('リース中は 409 で何も変えず AI も呼ばない。リースが切れれば実行できる', async () => {
    const { env, cleanup, ai } = await rejudgeHarness('rejudge-registered-lease')
    try {
      const leased = await seedRejudgeJob(env, 1, {
        ...autoRegisteredSeed,
        leaseUntil: dayjs().add(5, 'minute').valueOf()
      })
      const before = await rowOf(env, 'webhook_event_jobs', 'post_id', leased)
      ai.state.armed = true
      expect(await statusOf(rejudgeWebhookJob(env, leased))).toEqual({ status: 409, message: 'Job is being processed' })
      expect(await rowOf(env, 'webhook_event_jobs', 'post_id', leased)).toEqual(before)
      expect(ai.state.calls).toEqual([])
      await env.DB.prepare('UPDATE webhook_event_jobs SET lease_until=? WHERE post_id=?')
        .bind(dayjs().subtract(1, 'minute').valueOf(), leased)
        .run()
      const job = await rejudgeWebhookJob(env, leased)
      expect(job).toMatchObject({ status: 'registered', confidence: REJUDGED_PROBABILITY })
      // 旧い判定結果（発見記録の無い形）は、現在の判定結果と発見記録に置き換わる。
      // 抽出段階の店舗が無い投稿なので、現在の判定は保留（extraction_store_unspecified）。登録済みの状態は変わらない。
      const stored = storedResult(await rowOf(env, 'webhook_event_jobs', 'post_id', leased))
      expect(stored).toMatchObject({ status: 'held', confidence: REJUDGED_PROBABILITY })
      expect(stored.reasons).toContain('extraction_store_unspecified')
      await expectNoLease(env, leased)
    } finally {
      await cleanup()
    }
  }, 60000)

  test('候補がリース中なら 409。親のリースを残さず、何も変えず、AI も呼ばない', async () => {
    const { env, cleanup, ai } = await rejudgeHarness('rejudge-registered-candidate-lease')
    try {
      const post = await registerPair(env, postIdOf(1))
      const [first, second] = (await getWebhookJob(env, post.id)).candidates
      await env.DB.prepare('UPDATE webhook_event_candidates SET lease_token=?,lease_until=? WHERE event_uuid=?')
        .bind('other-worker', dayjs().add(5, 'minute').valueOf(), second.eventUUID)
        .run()
      const firstBefore = await rowOf(env, 'webhook_event_candidates', 'event_uuid', first.eventUUID)
      const secondBefore = await rowOf(env, 'webhook_event_candidates', 'event_uuid', second.eventUUID)
      const parentBefore = await rowOf(env, 'webhook_event_jobs', 'post_id', post.id)
      ai.state.armed = true
      expect(await statusOf(rejudgeWebhookJob(env, post.id, second.eventUUID))).toEqual({
        status: 409,
        message: 'Candidate is being processed'
      })
      expect(ai.state.calls).toEqual([])
      expect(await rowOf(env, 'webhook_event_candidates', 'event_uuid', first.eventUUID)).toEqual(firstBefore)
      expect(await rowOf(env, 'webhook_event_candidates', 'event_uuid', second.eventUUID)).toEqual(secondBefore)
      expect(await rowOf(env, 'webhook_event_jobs', 'post_id', post.id)).toEqual(parentBefore)
    } finally {
      await cleanup()
    }
  }, 60000)

  test('人が対象外にした投稿と処理中（待機・処理中）は 409 で、DB を変えず AI も呼ばない', async () => {
    const { env, cleanup, ai, sent } = await rejudgeHarness('rejudge-registered-blocked')
    try {
      const cases = [
        { seed: rejectedSeed, message: 'Manually rejected jobs cannot be re-judged' },
        {
          seed: { ...ignoredSeed, status: 'failed', reasons: ['manually_rejected'] },
          message: 'Manually rejected jobs cannot be re-judged'
        },
        // 人の却下が付いた登録済み（自動登録の扱いではなく、却下を優先する）
        {
          seed: { ...autoRegisteredSeed, reasons: ['manually_rejected'] },
          message: 'Manually rejected jobs cannot be re-judged'
        },
        { seed: { ...heldSeed, status: 'queued', reasons: [] }, message: 'This job cannot be re-judged' },
        { seed: { ...heldSeed, status: 'processing', reasons: [] }, message: 'This job cannot be re-judged' }
      ]
      ai.state.armed = true
      for (const [index, { seed, message }] of cases.entries()) {
        const postId = await seedRejudgeJob(env, index + 1, seed)
        const before = await rowOf(env, 'webhook_event_jobs', 'post_id', postId)
        expect(await statusOf(rejudgeWebhookJob(env, postId))).toEqual({ status: 409, message })
        expect(await rowOf(env, 'webhook_event_jobs', 'post_id', postId)).toEqual(before)
      }
      expect(ai.state.calls).toEqual([])
      expect(sent).toEqual([])
    } finally {
      await cleanup()
    }
  }, 60000)

  test('リースを取る前の状態が古くても、取得後に読み直して弾く（連携・却下された行は上書きしない）', async () => {
    const { env, cleanup, ai, sent } = await rejudgeHarness('rejudge-registered-stale')
    try {
      ai.state.armed = true
      const linked = await seedRejudgeJob(env, 1, autoRegisteredSeed)
      const rejected = await seedRejudgeJob(env, 2, autoRegisteredSeed)
      for (const [postId, reasons, message] of [
        [linked, ['manually_linked'], 'This job cannot be re-judged'],
        [rejected, ['manually_rejected'], 'Manually rejected jobs cannot be re-judged']
      ] as const) {
        // 古い読み取り（自動登録済み）を持ったまま、行が連携・却下に変わった状態。
        const parent = await getWebhookJob(env, postId)
        const stale = await actionJob(env, postId)
        expect(stale.status).toBe('registered')
        await env.DB.prepare('UPDATE webhook_event_jobs SET reasons_json=? WHERE post_id=?')
          .bind(JSON.stringify(reasons), postId)
          .run()
        const before = await rowOf(env, 'webhook_event_jobs', 'post_id', postId)
        expect(await statusOf(rejudgeRegisteredWebhookJob(env, postId, parent, stale))).toEqual({
          status: 409,
          message
        })
        // 連携・却下された行は変わらず、リースも残らない。
        expect(unchangedColumns(await rowOf(env, 'webhook_event_jobs', 'post_id', postId))).toEqual(
          unchangedColumns(before)
        )
        await expectNoLease(env, postId)
      }
      expect(ai.state.calls).toEqual([])
      expect(sent).toEqual([])
    } finally {
      await cleanup()
    }
  }, 60000)
})

describe('自動登録済みの再実行: 複数候補', () => {
  test('候補を選んだときだけ、その候補を更新する。他の候補と親ジョブは変えない。未指定は 409', async () => {
    const { env, cleanup, ai } = await rejudgeHarness('rejudge-registered-candidate-selection')
    try {
      const post = await registerPair(env, postIdOf(2))
      const saved = await getWebhookJob(env, post.id)
      expect(saved.candidates.map((candidate) => candidate.status)).toEqual(['registered', 'registered'])
      const [first, second] = saved.candidates
      ai.state.armed = true
      expect(await statusOf(rejudgeWebhookJob(env, post.id))).toEqual({
        status: 409,
        message: 'Select a webhook candidate'
      })
      expect(ai.state.calls).toEqual([])
      const firstBefore = await rowOf(env, 'webhook_event_candidates', 'event_uuid', first.eventUUID)
      const secondBefore = await rowOf(env, 'webhook_event_candidates', 'event_uuid', second.eventUUID)
      const parentBefore = await rowOf(env, 'webhook_event_jobs', 'post_id', post.id)
      const databaseBefore = await databaseSnapshot(env)
      const job = await rejudgeWebhookJob(env, post.id, second.eventUUID)
      expect(await rowOf(env, 'webhook_event_candidates', 'event_uuid', first.eventUUID)).toEqual(firstBefore)
      // 親ジョブは先頭候補の写しなので、2 番目の候補の再実行では行ごと変わらない。
      expect(await rowOf(env, 'webhook_event_jobs', 'post_id', post.id)).toEqual(parentBefore)
      const secondAfter = await rowOf(env, 'webhook_event_candidates', 'event_uuid', second.eventUUID)
      expect(secondAfter.confidence).toBe(REJUDGED_PROBABILITY)
      expect(storedResult(secondAfter).confidence).toBe(REJUDGED_PROBABILITY)
      expect(secondAfter.result_json).not.toBe(secondBefore.result_json)
      expect(unchangedColumns(secondAfter)).toEqual(unchangedColumns(secondBefore))
      expect(await databaseSnapshot(env)).toEqual(databaseBefore)
      expect(job.candidates[0].confidence).toBe(first.confidence)
      expect(job.candidates[1].confidence).toBe(REJUDGED_PROBABILITY)
      // 先頭の候補を再実行すると、親ジョブの写し（回答・確率）も合わせる。親の状態・通知・判定結果は変わらない。
      await rejudgeWebhookJob(env, post.id, first.eventUUID)
      const parentAfter = await rowOf(env, 'webhook_event_jobs', 'post_id', post.id)
      expect(parentAfter).toMatchObject({ confidence: REJUDGED_PROBABILITY })
      expect(parentAfter.answers_json).not.toBe(parentBefore.answers_json)
      expect(parentAfter.result_json).toBe(parentBefore.result_json)
      expect(parentAfter.requests_json).toBe(parentBefore.requests_json)
      await expectNoLease(env, post.id)
    } finally {
      await cleanup()
    }
  }, 60000)
})

describe('自動登録済み以外の再実行は、従来どおり queued に戻して処理し直す', () => {
  test('保留・失敗・人が却下していない対象外・手動連携の登録済みは queued に戻り、同期では AI を呼ばない', async () => {
    const { env, cleanup, ai, sent, notifications } = await rejudgeHarness('rejudge-registered-dispatch')
    try {
      ai.state.armed = true
      const seeds = [
        heldSeed,
        { ...heldSeed, status: 'failed', reasons: [], notificationStatus: 'pending' },
        ignoredSeed,
        linkedSeed
      ]
      const notified = notifications.length
      for (const [index, seed] of seeds.entries()) {
        const postId = await seedRejudgeJob(env, index + 1, seed)
        const job = await rejudgeWebhookJob(env, postId)
        expect(job).toMatchObject({ postId, status: 'queued', reasons: [], answers: null, confidence: null })
        expect(await rowOf(env, 'webhook_event_jobs', 'post_id', postId)).toMatchObject({
          status: 'queued',
          result_json: null,
          answers_json: null
        })
        expect(sent.at(-1)).toBe(postId)
      }
      // 手動連携だけは、誤った連携を外すため event_id を戻す。
      const linked = await rowOf(env, 'webhook_event_jobs', 'post_id', rejudgePostId(4))
      expect(linked.event_id).toBeNull()
      expect(sent).toHaveLength(seeds.length)
      expect(ai.state.calls).toEqual([])
      expect(notifications).toHaveLength(notified)
    } finally {
      await cleanup()
    }
  }, 60000)

  test('manually_linked を部分一致で含むだけの理由の登録済みは、手動連携ではなく自動登録済みとして扱う', async () => {
    const { env, cleanup, ai, sent } = await rejudgeHarness('rejudge-registered-partial-match')
    try {
      const seed = { ...linkedSeed, reasons: ['possible_duplicate:manually_linked_x'] }
      const postId = await seedRejudgeJob(env, 1, seed)
      const before = await rowOf(env, 'webhook_event_jobs', 'post_id', postId)
      ai.state.armed = true
      const job = await rejudgeWebhookJob(env, postId)
      // queued には戻らず、登録・理由・連携先・通知は残したまま、判定結果だけが更新される。
      expect(job).toMatchObject({ status: 'registered', confidence: REJUDGED_PROBABILITY })
      expect(ai.state.calls.length).toBeGreaterThan(0)
      const after = await rowOf(env, 'webhook_event_jobs', 'post_id', postId)
      expect(unchangedColumns(after)).toEqual(unchangedColumns(before))
      expect(after.event_id).toBe(before.event_id)
      expect(sent).toEqual([])
    } finally {
      await cleanup()
    }
  }, 60000)
})
