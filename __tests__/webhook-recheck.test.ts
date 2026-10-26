import { describe, expect, test } from 'bun:test'
import adminWebhookRoutes from '@api/routes/admin-webhook'
import { rejudgeWebhookJob } from '@api/services/webhook-admin'
import { recheckWebhookJob } from '@api/services/webhook-recheck'
import { DETECTION_VERSION } from '@biccame/shared/event-detect/detection'
import { WebhookJobSchema } from '@biccame/shared/schemas/webhook.dto'
import dayjs from 'dayjs'
import { heldSeed, ignoredSeed, seedRejudgeJob } from './fixtures/webhook-d1-jobs'
import {
  databaseSnapshot,
  expectNoLease,
  getWebhookJob,
  RECHECK_COLUMNS,
  RECHECKED_PROBABILITY,
  type RecheckMode,
  recheckHarness,
  registerPair,
  registerSingle,
  rowOf,
  saveModel,
  statusOf,
  unchangedColumns
} from './fixtures/webhook-recheck'
import { linkedSeed } from './fixtures/webhook-relink'

/** 回答の質問キー。未判定（null）は空。 */
const answerKeys = (answers: Record<string, unknown> | null): string[] => (answers === null ? [] : Object.keys(answers))

const postIdOf = (index: number) => `210922172177358${String(index).padStart(4, '0')}`

/** 旧版（v2）で保存された 9 問の回答。character の質問が無い（store は choice）。 */
const v2Answers = JSON.stringify({
  is_event: { type: 'noul', noul: 0.72 },
  status: { type: 'choice', choice: 'start', probabilities: { start: 0.9, announce: 0.1 } },
  category: { type: 'choice', choice: 'limited_card', probabilities: { limited_card: 0.95 } },
  store: { type: 'choice', choice: 'akiba', probabilities: { akiba: 0.95 } },
  start_date: { type: 'choice', choice: 'd20261011', probabilities: { d20261011: 0.95 } },
  end_date: { type: 'choice', choice: 'none', probabilities: { none: 0.95 } },
  quantity: { type: 'choice', choice: 'none', probabilities: { none: 0.95 } },
  condition: { type: 'choice', choice: 'everyone', probabilities: { everyone: 0.95 } },
  purchase_amount: { type: 'choice', choice: 'none', probabilities: { none: 0.95 } }
})

describe('登録済みジョブの確認用の再判定（サービス）', () => {
  test('自動登録済みジョブの回答・確率・版・モデルだけを更新し、状態・イベント・通知・キューは変えない', async () => {
    const { env, cleanup, notifications, sent, ai } = await recheckHarness('recheck-auto-registered')
    try {
      const post = await registerSingle(env, postIdOf(1))
      const before = await getWebhookJob(env, post.id)
      expect(before.status).toBe('registered')
      expect(before.reasons).not.toContain('manually_linked')
      const candidateId = before.candidates[0].eventUUID
      const candidateBefore = await rowOf(env, 'webhook_event_candidates', 'event_uuid', candidateId)
      const parentBefore = await rowOf(env, 'webhook_event_jobs', 'post_id', post.id)
      const databaseBefore = await databaseSnapshot(env)
      const notified = notifications.length
      await saveModel(env, 'clef-flash')
      ai.state.armed = true
      const startedAt = dayjs().valueOf()
      const job = await recheckWebhookJob(env, post.id)
      expect(ai.state.calls.length).toBeGreaterThan(0)
      const candidateAfter = await rowOf(env, 'webhook_event_candidates', 'event_uuid', candidateId)
      // 回答・確率・版・モデル・判定時刻・送信入力が新しい値になる。
      expect(candidateAfter.answers_json).not.toBe(candidateBefore.answers_json)
      expect(candidateAfter.confidence).toBe(RECHECKED_PROBABILITY)
      expect(candidateBefore.confidence).not.toBe(RECHECKED_PROBABILITY)
      expect(candidateAfter.model).toBe('clef-flash')
      expect(candidateBefore.model).toBe('clef')
      expect(candidateAfter.question_version).toBe(DETECTION_VERSION)
      expect(Number(candidateAfter.judged_at)).toBeGreaterThanOrEqual(startedAt)
      expect(candidateAfter.requests_json).not.toBe(candidateBefore.requests_json)
      expect(JSON.parse(String(candidateAfter.answers_json)).is_event.noul).toBe(RECHECKED_PROBABILITY)
      // それ以外の列（状態・event_id・登録候補・理由・判定結果・通知・処理回数など）は一致する。
      expect(unchangedColumns(candidateAfter)).toEqual(unchangedColumns(candidateBefore))
      expect(candidateAfter).toMatchObject({
        status: 'registered',
        event_id: candidateBefore.event_id,
        lease_token: null,
        lease_until: null
      })
      // 親ジョブは先頭候補の写しとして同じ回答になり、状態・通知・処理回数・抽出は変わらない。
      const parentAfter = await rowOf(env, 'webhook_event_jobs', 'post_id', post.id)
      expect(parentAfter.answers_json).toBe(candidateAfter.answers_json)
      expect(parentAfter).toMatchObject({
        confidence: RECHECKED_PROBABILITY,
        model: 'clef-flash',
        question_version: DETECTION_VERSION,
        lease_token: null,
        lease_until: null
      })
      for (const column of [
        'requests_json',
        'extraction_json',
        'status',
        'event_id',
        'candidate_json',
        'reasons_json'
      ]) {
        expect(parentAfter[column]).toEqual(parentBefore[column])
      }
      for (const column of [
        'result_json',
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
      // 応答は更新後のジョブ。
      expect(job).toEqual(await getWebhookJob(env, post.id))
      expect(job.candidates[0]).toMatchObject({ status: 'registered', confidence: RECHECKED_PROBABILITY })
      expect(job.candidates[0].reasons).toEqual(before.candidates[0].reasons)
      expect(job.candidates[0].eventId).toBe(before.candidates[0].eventId)
    } finally {
      await cleanup()
    }
  }, 60000)

  test('v2 の保存データ（9 問・character なし）は、再確認で現行の質問（store と character の choice）に置き換わり、版が現行になる', async () => {
    const { env, cleanup, ai, notifications, sent } = await recheckHarness('recheck-v2')
    try {
      const postId = await seedRejudgeJob(env, 1, { ...linkedSeed, reasons: ['title_generated'] })
      await env.DB.prepare('UPDATE webhook_event_jobs SET answers_json=?,question_version=? WHERE post_id=?')
        .bind(v2Answers, 'v2-webhook-v4', postId)
        .run()
      const before = await getWebhookJob(env, postId)
      expect(before.questionVersion).toBe('v2-webhook-v4')
      const beforeKeys = answerKeys(before.answers)
      expect(beforeKeys).toHaveLength(9)
      expect(beforeKeys).not.toContain('character')
      expect(beforeKeys.some((key) => /^(venue|character)\./.test(key))).toBe(false)
      const rowBefore = await rowOf(env, 'webhook_event_jobs', 'post_id', postId)
      ai.state.armed = true
      const job = await recheckWebhookJob(env, postId)
      const keys = answerKeys(job.answers)
      // 回答のキーは、再確認で送った現行の質問のキーと一致する（store と character は choice 1 問ずつ、venue.* / character.* は無い）。
      // 現行の v16 は 1 段目の判定と 2 段目の確認の 2 回送るので、キーは 2 回の質問の和集合。
      expect(ai.state.calls).toHaveLength(2)
      expect(keys.slice().sort()).toEqual(ai.state.calls.flatMap((call) => Object.keys(call.questions)).sort())
      expect(keys).toContain('store')
      expect(keys).toContain('character')
      expect(keys.some((key) => /^(venue|character)\./.test(key))).toBe(false)
      expect(job.answers?.store.type).toBe('choice')
      expect(job.answers?.character.type).toBe('choice')
      expect(job.questionVersion).toBe(DETECTION_VERSION)
      expect(job.confidence).toBe(RECHECKED_PROBABILITY)
      // 候補の無い旧形式は親ジョブ自身を更新する。ほかの列は変えない。
      const rowAfter = await rowOf(env, 'webhook_event_jobs', 'post_id', postId)
      expect(unchangedColumns(rowAfter)).toEqual(unchangedColumns(rowBefore))
      expect(job).toMatchObject({ status: 'registered', eventId: before.eventId, candidates: [] })
      expect(notifications).toEqual([])
      expect(sent).toEqual([])
    } finally {
      await cleanup()
    }
  }, 60000)

  test('旧形式（legacy-single）へ移行済みの登録済みでも、候補の行を更新して動く', async () => {
    const { env, cleanup, ai } = await recheckHarness('recheck-legacy-single')
    try {
      const postId = await seedRejudgeJob(env, 1, { ...linkedSeed, reasons: ['title_generated'] })
      await env.DB.prepare(
        'UPDATE webhook_event_jobs SET extraction_json=\'{"version":"legacy-single"}\' WHERE post_id=?'
      )
        .bind(postId)
        .run()
      await env.DB.prepare(`INSERT INTO webhook_event_candidates (event_uuid,post_id,item,post_json,source_url,status,reasons_json,
        result_json,candidate_json,answers_json,model,question_version,confidence,judged_at,event_id,attempts,notification_status,
        created_at,updated_at) SELECT event_uuid,post_id,'既存配布物',post_json,source_url,status,reasons_json,result_json,
        candidate_json,answers_json,model,question_version,confidence,judged_at,event_id,attempts,notification_status,
        created_at,updated_at FROM webhook_event_jobs WHERE post_id=?`)
        .bind(postId)
        .run()
      const before = await getWebhookJob(env, postId)
      expect(before.candidates).toHaveLength(1)
      ai.state.armed = true
      const job = await recheckWebhookJob(env, postId)
      expect(job.candidates[0]).toMatchObject({ status: 'registered', confidence: RECHECKED_PROBABILITY })
      expect(job.candidates[0].questionVersion).toBe(DETECTION_VERSION)
      expect(job.candidates[0].eventId).toBe(before.candidates[0].eventId)
      expect(job.reasons).toEqual(before.reasons)
      await expectNoLease(env, postId)
    } finally {
      await cleanup()
    }
  }, 60000)

  test('手動連携の登録済みでも再確認でき、通常の再判定（rejudge）の規則は変わらない', async () => {
    const { env, cleanup, ai, sent } = await recheckHarness('recheck-manual-and-rejudge')
    try {
      const auto = await seedRejudgeJob(env, 1, { ...linkedSeed, reasons: ['title_generated'] })
      const manual = await seedRejudgeJob(env, 2, linkedSeed)
      const held = await seedRejudgeJob(env, 3, heldSeed)
      ai.state.armed = true
      expect((await recheckWebhookJob(env, manual)).confidence).toBe(RECHECKED_PROBABILITY)
      expect((await recheckWebhookJob(env, auto)).confidence).toBe(RECHECKED_PROBABILITY)
      expect(sent).toEqual([])
      // 再判定は、自動登録済みを今までどおり 409 で拒み、手動連携と保留はキューへ戻す。
      expect(await statusOf(rejudgeWebhookJob(env, auto))).toEqual({
        status: 409,
        message: 'Only held or ignored jobs can be re-judged'
      })
      expect((await rejudgeWebhookJob(env, manual)).status).toBe('queued')
      expect((await rejudgeWebhookJob(env, held)).status).toBe('queued')
      expect(sent).toEqual([manual, held])
    } finally {
      await cleanup()
    }
  }, 60000)

  test('複数候補の投稿は選んだ候補だけを更新し、他の候補と親ジョブは変えない。未指定は 409', async () => {
    const { env, cleanup, ai } = await recheckHarness('recheck-candidate-selection')
    try {
      const post = await registerPair(env, postIdOf(1))
      const saved = await getWebhookJob(env, post.id)
      expect(saved.candidates.map((candidate) => candidate.status)).toEqual(['registered', 'registered'])
      const [first, second] = saved.candidates
      ai.state.armed = true
      expect(await statusOf(recheckWebhookJob(env, post.id))).toEqual({
        status: 409,
        message: 'Select a webhook candidate'
      })
      expect(ai.state.calls).toEqual([])
      const firstBefore = await rowOf(env, 'webhook_event_candidates', 'event_uuid', first.eventUUID)
      const secondBefore = await rowOf(env, 'webhook_event_candidates', 'event_uuid', second.eventUUID)
      const parentBefore = await rowOf(env, 'webhook_event_jobs', 'post_id', post.id)
      const databaseBefore = await databaseSnapshot(env)
      const job = await recheckWebhookJob(env, post.id, second.eventUUID)
      expect(await rowOf(env, 'webhook_event_candidates', 'event_uuid', first.eventUUID)).toEqual(firstBefore)
      // 親ジョブは先頭候補の写しなので、2 番目の候補の再確認では行ごと変わらない。
      expect(await rowOf(env, 'webhook_event_jobs', 'post_id', post.id)).toEqual(parentBefore)
      const secondAfter = await rowOf(env, 'webhook_event_candidates', 'event_uuid', second.eventUUID)
      expect(secondAfter.confidence).toBe(RECHECKED_PROBABILITY)
      expect(secondAfter.question_version).toBe(DETECTION_VERSION)
      expect(unchangedColumns(secondAfter)).toEqual(unchangedColumns(secondBefore))
      expect(await databaseSnapshot(env)).toEqual(databaseBefore)
      expect(job.candidates[0].confidence).toBe(first.confidence)
      expect(job.candidates[1].confidence).toBe(RECHECKED_PROBABILITY)
      // 先頭の候補を再確認すると、親ジョブの写し（回答・確率）も合わせる。親の状態・通知は変わらない。
      await recheckWebhookJob(env, post.id, first.eventUUID)
      const parentAfter = await rowOf(env, 'webhook_event_jobs', 'post_id', post.id)
      expect(parentAfter).toMatchObject({ confidence: RECHECKED_PROBABILITY, question_version: DETECTION_VERSION })
      expect(unchangedColumns(parentAfter)).toEqual(unchangedColumns(parentBefore))
      await expectNoLease(env, post.id)
    } finally {
      await cleanup()
    }
  }, 60000)

  test('登録済み以外（保留・対象外・待機・処理中・失敗）は 409 で、DB を変えず AI も呼ばない', async () => {
    const { env, cleanup, ai } = await recheckHarness('recheck-not-registered')
    try {
      const seeds = [
        { ...heldSeed },
        { ...ignoredSeed },
        { ...heldSeed, status: 'queued' },
        { ...heldSeed, status: 'processing' },
        { ...heldSeed, status: 'failed' }
      ]
      ai.state.armed = true
      for (const [index, seed] of seeds.entries()) {
        const postId = await seedRejudgeJob(env, index + 1, seed)
        const before = await rowOf(env, 'webhook_event_jobs', 'post_id', postId)
        expect(await statusOf(recheckWebhookJob(env, postId))).toEqual({
          status: 409,
          message: 'Only registered jobs can be re-checked'
        })
        expect(await rowOf(env, 'webhook_event_jobs', 'post_id', postId)).toEqual(before)
      }
      // 処理中（リースが未来）の登録済みも拒む。リースが切れれば再確認できる。
      const leased = await seedRejudgeJob(env, 9, { ...linkedSeed, leaseUntil: dayjs().add(5, 'minute').valueOf() })
      const leasedBefore = await rowOf(env, 'webhook_event_jobs', 'post_id', leased)
      expect(await statusOf(recheckWebhookJob(env, leased))).toEqual({ status: 409, message: 'Job is being processed' })
      expect(await rowOf(env, 'webhook_event_jobs', 'post_id', leased)).toEqual(leasedBefore)
      expect(ai.state.calls).toEqual([])
      await env.DB.prepare('UPDATE webhook_event_jobs SET lease_until=? WHERE post_id=?')
        .bind(dayjs().subtract(1, 'minute').valueOf(), leased)
        .run()
      expect((await recheckWebhookJob(env, leased)).confidence).toBe(RECHECKED_PROBABILITY)
    } finally {
      await cleanup()
    }
  }, 60000)

  test.each<[RecheckMode, string]>([
    ['throw', 'AI re-check failed'],
    ['invalid', 'AI re-check failed'],
    ['incomplete', 'AI re-check failed'],
    ['wrong_type', 'AI re-check failed'],
    ['unknown_key', 'AI re-check failed']
  ])(
    'AI が %s のとき 502 を返し、何も保存せず、リースを解放する（直後にもう一度再確認できる）',
    async (mode, message) => {
      const { env, cleanup, ai, notifications, sent } = await recheckHarness(`recheck-failure-${mode}`)
      try {
        const post = await registerSingle(env, postIdOf(1))
        const candidateId = (await getWebhookJob(env, post.id)).candidates[0].eventUUID
        const candidateBefore = await rowOf(env, 'webhook_event_candidates', 'event_uuid', candidateId)
        const parentBefore = await rowOf(env, 'webhook_event_jobs', 'post_id', post.id)
        const databaseBefore = await databaseSnapshot(env)
        const notified = notifications.length
        ai.state.armed = true
        ai.state.mode = mode
        expect(await statusOf(recheckWebhookJob(env, post.id))).toEqual({ status: 502, message })
        expect(ai.state.calls.length).toBeGreaterThan(0)
        // 送信入力（requests_json）も含め、行ごと元のまま。
        expect(await rowOf(env, 'webhook_event_candidates', 'event_uuid', candidateId)).toEqual(candidateBefore)
        expect(await rowOf(env, 'webhook_event_jobs', 'post_id', post.id)).toEqual(parentBefore)
        expect(await databaseSnapshot(env)).toEqual(databaseBefore)
        await expectNoLease(env, post.id)
        expect(notifications).toHaveLength(notified)
        expect(sent).toEqual([])
        // リースが残っていないので、すぐにもう一度再確認でき、今度は成功する。
        ai.state.mode = 'ok'
        expect((await recheckWebhookJob(env, post.id)).candidates[0].confidence).toBe(RECHECKED_PROBABILITY)
        await expectNoLease(env, post.id)
      } finally {
        await cleanup()
      }
    },
    60000
  )
})

describe('登録済みジョブの確認用の再判定（API）', () => {
  test('ボディなしの POST で更新後のジョブを返し、404・409・400・502 を対応づける', async () => {
    const { env, cleanup, ai, sent } = await recheckHarness('recheck-route')
    try {
      const post = await registerSingle(env, postIdOf(1))
      const held = await seedRejudgeJob(env, 2, heldSeed)
      const request = (id: string, query = '') =>
        adminWebhookRoutes.request(`/admin/webhook/jobs/${id}/recheck${query}`, { method: 'POST' }, env)
      ai.state.armed = true
      const response = await request(post.id)
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('no-store')
      const body = WebhookJobSchema.safeParse(await response.json())
      expect(body.success).toBe(true)
      expect(body.success ? body.data : null).toMatchObject({ postId: post.id, status: 'registered' })
      expect(body.success ? body.data.candidates[0].confidence : null).toBe(RECHECKED_PROBABILITY)
      const refused = await request(held)
      expect(refused.status).toBe(409)
      expect(await refused.text()).toBe('Only registered jobs can be re-checked')
      expect((await request('9999')).status).toBe(404)
      expect((await request('not-a-post-id')).status).toBe(400)
      expect((await request(post.id, '?candidateId=not-a-uuid')).status).toBe(400)
      expect((await request(post.id, '?candidateId=11111111-1111-4111-8111-111111111111')).status).toBe(404)
      ai.state.mode = 'throw'
      const failed = await request(post.id)
      expect(failed.status).toBe(502)
      expect(await failed.text()).toBe('AI re-check failed')
      expect(sent).toEqual([])
    } finally {
      await cleanup()
    }
  }, 60000)
})

test('再確認が書き換える列は回答・モデル・版・確率・判定時刻・更新時刻・送信入力だけ', () => {
  expect(RECHECK_COLUMNS).toEqual([
    'answers_json',
    'model',
    'question_version',
    'confidence',
    'judged_at',
    'updated_at',
    'requests_json'
  ])
})
