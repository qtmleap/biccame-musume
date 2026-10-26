import { describe, expect, test } from 'bun:test'
import adminWebhookRoutes from '@api/routes/admin-webhook'
import { rejudgeWebhookJob } from '@api/services/webhook-admin'
import { DETECTION_VERSION } from '@biccame/shared/event-detect/detection'
import { WebhookJobSchema } from '@biccame/shared/schemas/webhook.dto'
import dayjs from 'dayjs'
import {
  databaseSnapshot,
  expectConfiguration,
  expectNoLease,
  getWebhookJob,
  judgeSingle,
  REJUDGED_COLUMNS,
  REJUDGED_PROBABILITY,
  type RejudgeMode,
  rejudgeHarness,
  rowOf,
  saveModel,
  statusOf,
  storedResult,
  unchangedColumns
} from './fixtures/webhook-rejudge-registered'

const postIdOf = (index: number) => `210922172177358${String(index).padStart(4, '0')}`

describe('自動登録済みの再実行（サービス）', () => {
  test('回答・判定結果・発見記録を現在の設定で書き換え、状態・イベント・通知・キューは変えない', async () => {
    const { env, cleanup, notifications, sent, ai } = await rejudgeHarness('rejudge-registered-auto')
    try {
      const post = await judgeSingle(env, postIdOf(1))
      const before = await getWebhookJob(env, post.id)
      expect(before.status).toBe('registered')
      expect(before.reasons).not.toContain('manually_linked')
      const candidateId = before.candidates[0].eventUUID
      const candidateBefore = await rowOf(env, 'webhook_event_candidates', 'event_uuid', candidateId)
      const parentBefore = await rowOf(env, 'webhook_event_jobs', 'post_id', post.id)
      const databaseBefore = await databaseSnapshot(env)
      const notified = notifications.length
      // 古い判定結果は、登録時（0.99）の確率で保存されている。
      expect(storedResult(candidateBefore).confidence).toBe(0.99)
      await saveModel(env, 'clef-flash')
      await expectConfiguration(env, { model: 'clef-flash' })
      ai.state.armed = true
      const startedAt = dayjs().valueOf()
      const job = await rejudgeWebhookJob(env, post.id)
      expect(ai.state.calls.length).toBeGreaterThan(0)
      const candidateAfter = await rowOf(env, 'webhook_event_candidates', 'event_uuid', candidateId)
      // 回答・確率・版・モデル・判定時刻・送信入力・判定結果が新しい値になる。
      expect(candidateAfter.answers_json).not.toBe(candidateBefore.answers_json)
      expect(JSON.parse(String(candidateAfter.answers_json)).is_event.noul).toBe(REJUDGED_PROBABILITY)
      expect(candidateAfter.confidence).toBe(REJUDGED_PROBABILITY)
      expect(candidateAfter.model).toBe('clef-flash')
      expect(candidateBefore.model).toBe('clef')
      expect(candidateAfter.question_version).toBe(DETECTION_VERSION)
      expect(Number(candidateAfter.judged_at)).toBeGreaterThanOrEqual(startedAt)
      expect(candidateAfter.requests_json).not.toBe(candidateBefore.requests_json)
      expect(candidateAfter.result_json).not.toBe(candidateBefore.result_json)
      const result = storedResult(candidateAfter)
      expect(result.confidence).toBe(REJUDGED_PROBABILITY)
      expect(result.status).toBe('register')
      // 発見記録も、新しい回答から作り直されている（古い回答の確率が残らない）。
      expect(result.discovery.confidence).toBe(REJUDGED_PROBABILITY)
      expect(job.candidates[0].discovery).toMatchObject({ confidence: REJUDGED_PROBABILITY })
      // それ以外の列（状態・event_id・登録候補・理由・通知・処理回数・semantic_key など）は一致する。
      expect(unchangedColumns(candidateAfter)).toEqual(unchangedColumns(candidateBefore))
      expect(candidateAfter).toMatchObject({
        status: 'registered',
        event_id: candidateBefore.event_id,
        lease_token: null,
        lease_until: null
      })
      // 親ジョブは先頭候補の写しとして同じ回答になり、状態・通知・処理回数・抽出・判定結果は変わらない。
      const parentAfter = await rowOf(env, 'webhook_event_jobs', 'post_id', post.id)
      expect(parentAfter.answers_json).toBe(candidateAfter.answers_json)
      expect(parentAfter).toMatchObject({
        confidence: REJUDGED_PROBABILITY,
        model: 'clef-flash',
        question_version: DETECTION_VERSION,
        lease_token: null,
        lease_until: null
      })
      for (const column of [
        'requests_json',
        'result_json',
        'extraction_json',
        'status',
        'event_id',
        'candidate_json',
        'reasons_json',
        'notification_status',
        'notification_attempts',
        'attempts',
        'semantic_key'
      ]) {
        expect(parentAfter[column]).toEqual(parentBefore[column])
      }
      // イベント本体と関連表、通知、キューは動かない。
      expect(await databaseSnapshot(env)).toEqual(databaseBefore)
      expect(notifications).toHaveLength(notified)
      expect(sent).toEqual([])
      // 応答は更新後のジョブ（再実行を受け付けた直後の形ではなく、結果が出た状態）。
      expect(job).toEqual(await getWebhookJob(env, post.id))
      expect(job.status).toBe('registered')
      expect(job.candidates[0]).toMatchObject({ status: 'registered', confidence: REJUDGED_PROBABILITY })
      expect(job.candidates[0].reasons).toEqual(before.candidates[0].reasons)
      expect(job.candidates[0].eventId).toBe(before.candidates[0].eventId)
      await expectNoLease(env, post.id)
    } finally {
      await cleanup()
    }
  }, 60000)

  test('再実行できるのは書き換える列だけ（それ以外の列は変わらない）', () => {
    expect(REJUDGED_COLUMNS).toEqual([
      'result_json',
      'answers_json',
      'model',
      'question_version',
      'confidence',
      'judged_at',
      'updated_at',
      'requests_json'
    ])
  })

  test('登録時と食い違う結果（held）になっても、登録済みのまま。判定結果にだけ残り、イベントと通知は変わらない', async () => {
    const { env, cleanup, notifications, sent, ai } = await rejudgeHarness('rejudge-registered-diverges')
    try {
      const post = await judgeSingle(env, postIdOf(2))
      const before = await getWebhookJob(env, post.id)
      const candidateId = before.candidates[0].eventUUID
      const eventBefore = await rowOf(env, 'webhook_event_candidates', 'event_uuid', candidateId)
      const databaseBefore = await databaseSnapshot(env)
      const notified = notifications.length
      // 状態の確率を 0.5 にすると、既定の下限（0.8）を割って保留の判定になる。
      ai.state.armed = true
      ai.state.probabilities = { status: 0.5 }
      const job = await rejudgeWebhookJob(env, post.id)
      const after = await rowOf(env, 'webhook_event_candidates', 'event_uuid', candidateId)
      const result = storedResult(after)
      expect(result.status).toBe('held')
      expect(result.reasons).toContain('status_unconfirmed')
      expect(result.discovery.reasons).toContain('status_unconfirmed')
      // 登録の状態・イベント・理由・通知は登録時のまま。
      expect(job.status).toBe('registered')
      expect(job.candidates[0]).toMatchObject({ status: 'registered', eventId: before.candidates[0].eventId })
      expect(job.candidates[0].reasons).toEqual(before.candidates[0].reasons)
      expect(after.candidate_json).toBe(eventBefore.candidate_json)
      expect(after.reasons_json).toBe(eventBefore.reasons_json)
      expect(await databaseSnapshot(env)).toEqual(databaseBefore)
      expect(notifications).toHaveLength(notified)
      expect(sent).toEqual([])
    } finally {
      await cleanup()
    }
  }, 60000)

  test.each<[RejudgeMode, string]>([
    ['throw', 'AI re-judge failed'],
    ['invalid', 'AI re-judge failed'],
    ['incomplete', 'AI re-judge failed'],
    ['wrong_type', 'AI re-judge failed'],
    ['unknown_key', 'AI re-judge failed']
  ])(
    'AI が %s のとき 502 を返し、何も保存せず（判定結果・送信入力も元のまま）、リースを解放する',
    async (mode, message) => {
      const { env, cleanup, ai, notifications, sent } = await rejudgeHarness(`rejudge-registered-failure-${mode}`)
      try {
        const post = await judgeSingle(env, postIdOf(3))
        const candidateId = (await getWebhookJob(env, post.id)).candidates[0].eventUUID
        const candidateBefore = await rowOf(env, 'webhook_event_candidates', 'event_uuid', candidateId)
        const parentBefore = await rowOf(env, 'webhook_event_jobs', 'post_id', post.id)
        const databaseBefore = await databaseSnapshot(env)
        const notified = notifications.length
        ai.state.armed = true
        ai.state.mode = mode
        expect(await statusOf(rejudgeWebhookJob(env, post.id))).toEqual({ status: 502, message })
        expect(ai.state.calls.length).toBeGreaterThan(0)
        // 判定結果（result_json）と送信入力（requests_json）も含め、行ごと元のまま。
        const candidateAfter = await rowOf(env, 'webhook_event_candidates', 'event_uuid', candidateId)
        expect(candidateAfter).toEqual(candidateBefore)
        expect(candidateAfter.result_json).toBe(candidateBefore.result_json)
        expect(candidateAfter.requests_json).toBe(candidateBefore.requests_json)
        expect(await rowOf(env, 'webhook_event_jobs', 'post_id', post.id)).toEqual(parentBefore)
        expect(await databaseSnapshot(env)).toEqual(databaseBefore)
        await expectNoLease(env, post.id)
        expect(notifications).toHaveLength(notified)
        expect(sent).toEqual([])
        // リースが残っていないので、すぐにもう一度実行でき、今度は成功する。
        ai.state.mode = 'ok'
        expect((await rejudgeWebhookJob(env, post.id)).candidates[0].confidence).toBe(REJUDGED_PROBABILITY)
        await expectNoLease(env, post.id)
      } finally {
        await cleanup()
      }
    },
    60000
  )
})

describe('自動登録済みの再実行（API）', () => {
  test('ボディなしの POST で更新後のジョブを返し、404・409・400・502 を対応づける', async () => {
    const { env, cleanup, ai, sent } = await rejudgeHarness('rejudge-registered-route')
    try {
      const post = await judgeSingle(env, postIdOf(4))
      const request = (id: string, query = '') =>
        adminWebhookRoutes.request(`/admin/webhook/jobs/${id}/rejudge${query}`, { method: 'POST' }, env)
      ai.state.armed = true
      const response = await request(post.id)
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('no-store')
      const body = WebhookJobSchema.safeParse(await response.json())
      expect(body.success).toBe(true)
      expect(body.success ? body.data : null).toMatchObject({ postId: post.id, status: 'registered' })
      expect(body.success ? body.data.candidates[0].confidence : null).toBe(REJUDGED_PROBABILITY)
      expect((await request('9999')).status).toBe(404)
      expect((await request('not-a-post-id')).status).toBe(400)
      expect((await request(post.id, '?candidateId=not-a-uuid')).status).toBe(400)
      expect((await request(post.id, '?candidateId=11111111-1111-4111-8111-111111111111')).status).toBe(404)
      ai.state.mode = 'throw'
      const failed = await request(post.id)
      expect(failed.status).toBe(502)
      expect(await failed.text()).toBe('AI re-judge failed')
      expect(sent).toEqual([])
    } finally {
      await cleanup()
    }
  }, 60000)
})
