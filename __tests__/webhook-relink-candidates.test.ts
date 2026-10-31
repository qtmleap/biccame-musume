import { describe, expect, test } from 'bun:test'
import { rejudgeWebhookJob, resolveWebhookJob } from '@api/services/webhook-admin'
import { getWebhookJob } from '@api/services/webhook-jobs'
import { webhookActionAvailability } from '@/components/admin/webhook-labels'
import { conflictOf, heldSeed, rawRejudgeRow, seedRejudgeJob, withRejudgeEnv } from './fixtures/webhook-d1-jobs'
import { baseJob, buttonState, LINK_LABEL, REJUDGE_LABEL, renderDetail } from './fixtures/webhook-rejudge'
import { candidateRow, eventSnapshot, insertAnnounce, insertEvent, seedCandidate } from './fixtures/webhook-relink'

const linkedId = '11111111-1111-4111-8111-111111111111'
const autoId = '22222222-2222-4222-8222-222222222222'
const oldEventA = '33333333-3333-4333-8333-333333333333'
const oldEventB = '44444444-4444-4444-8444-444444444444'

/** 親ジョブの下に、手動連携した候補（先頭）と自動登録された候補を並べる。 */
const seedPair = async (env: Parameters<Parameters<typeof withRejudgeEnv>[0]>[0], index: number) => {
  const postId = await seedRejudgeJob(env, index, { ...heldSeed, status: 'registered', notificationStatus: 'sent' })
  await seedCandidate(env, postId, {
    uuid: linkedId,
    status: 'registered',
    reasons: ['manually_linked'],
    eventId: oldEventA,
    notificationStatus: 'sent',
    createdAt: 1791676800000
  })
  await seedCandidate(env, postId, {
    uuid: autoId,
    status: 'registered',
    reasons: ['title_generated'],
    eventId: oldEventB,
    notificationStatus: 'sent',
    createdAt: 1791676800001
  })
  return postId
}

describe('複数候補ジョブの連携し直しと判定し直し', () => {
  test('候補を別イベントへ付け替える。通知の状態と元のイベントは変えず、親の集約も追従する', async () => {
    await withRejudgeEnv(async (env) => {
      await insertEvent(env, oldEventA, '元の連携先A')
      await insertEvent(env, oldEventB, '元の連携先B')
      const postId = await seedPair(env, 1)
      await insertAnnounce(env, oldEventA, `https://x.com/bic_akiba/status/${postId}`)
      const before = [await eventSnapshot(env, oldEventA), await eventSnapshot(env, oldEventB)]
      const nextId = crypto.randomUUID()
      await insertEvent(env, nextId, '新しい連携先')
      for (const candidateId of [linkedId, autoId]) {
        const job = await resolveWebhookJob(env, postId, { action: 'link', eventId: nextId, candidateId })
        expect(job.status).toBe('registered')
        expect(job.candidates.find((candidate) => candidate.eventUUID === candidateId)).toMatchObject({
          status: 'registered',
          eventId: nextId,
          reasons: ['manually_linked'],
          notificationStatus: 'sent',
          notificationError: 'previous notification error',
          notificationAttempts: 2
        })
      }
      expect(await candidateRow(env, linkedId)).toMatchObject({ event_id: nextId, notification_status: 'sent' })
      expect(await candidateRow(env, autoId)).toMatchObject({ event_id: nextId, notification_status: 'sent' })
      // 親は先頭の候補の連携先を指し、通知の集約も変わらない。
      expect(await rawRejudgeRow(env, postId)).toMatchObject({
        status: 'registered',
        event_id: nextId,
        notification_status: 'sent',
        notification_attempts: 4,
        lease_token: null,
        lease_until: null
      })
      expect([await eventSnapshot(env, oldEventA), await eventSnapshot(env, oldEventB)]).toEqual(before)
    })
  }, 60000)

  test('候補を指定せずに連携すると 409（複数候補では選択が必要）', async () => {
    await withRejudgeEnv(async (env) => {
      const postId = await seedPair(env, 1)
      const nextId = crypto.randomUUID()
      await insertEvent(env, nextId, '新しい連携先')
      expect(await conflictOf(resolveWebhookJob(env, postId, { action: 'link', eventId: nextId }))).toEqual({
        status: 409,
        message: 'Select a webhook candidate'
      })
    })
  }, 60000)

  test('手動連携した候補は判定し直せる。event_id を外し、親の集約と他の候補は変えない', async () => {
    await withRejudgeEnv(async (env, sent) => {
      await insertEvent(env, oldEventA, '誤って連携したイベント')
      await insertEvent(env, oldEventB, '自動登録されたイベント')
      const postId = await seedPair(env, 1)
      const before = [await eventSnapshot(env, oldEventA), await eventSnapshot(env, oldEventB)]
      const autoBefore = await candidateRow(env, autoId)
      const job = await rejudgeWebhookJob(env, postId, linkedId)
      expect(job.status).toBe('queued')
      expect(job.candidates.find((candidate) => candidate.eventUUID === linkedId)).toMatchObject({
        status: 'queued',
        eventId: null,
        reasons: [],
        candidate: null,
        answers: null,
        notificationStatus: 'pending',
        notificationError: null
      })
      expect(await candidateRow(env, linkedId)).toMatchObject({
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
        last_error: null,
        attempts: 3,
        notification_attempts: 2
      })
      expect(await candidateRow(env, autoId)).toEqual(autoBefore)
      expect((await getWebhookJob(env, postId)).candidates.map((candidate) => candidate.eventId)).toEqual([
        null,
        oldEventB
      ])
      expect([await eventSnapshot(env, oldEventA), await eventSnapshot(env, oldEventB)]).toEqual(before)
      expect(sent).toEqual([postId])
    })
  }, 60000)

  // 自動登録された候補の再実行は 409 ではなく、登録を変えずに判定だけをやり直す（webhook-rejudge-registered-guards.test.ts）。
  test('人が却下した候補は判定し直せない', async () => {
    await withRejudgeEnv(async (env, sent) => {
      const postId = await seedPair(env, 1)
      await env.DB.prepare('UPDATE webhook_event_candidates SET reasons_json=?,status=? WHERE event_uuid=?')
        .bind(JSON.stringify(['manually_rejected']), 'ignored', autoId)
        .run()
      const before = await candidateRow(env, autoId)
      expect((await conflictOf(rejudgeWebhookJob(env, postId, autoId))).status).toBe(409)
      expect(await candidateRow(env, autoId)).toEqual(before)
      expect(sent).toEqual([])
    })
  }, 60000)

  test('旧形式（legacy-single）の登録済み候補は、手動連携でも安全側で 409 にして、リースを残さない', async () => {
    await withRejudgeEnv(async (env, sent) => {
      const postId = await seedRejudgeJob(env, 1, { ...heldSeed, status: 'registered', notificationStatus: 'sent' })
      await env.DB.prepare('UPDATE webhook_event_jobs SET extraction_json=? WHERE post_id=?')
        .bind('{"version":"legacy-single"}', postId)
        .run()
      await seedCandidate(env, postId, {
        uuid: linkedId,
        status: 'registered',
        reasons: ['manually_linked'],
        eventId: oldEventA,
        notificationStatus: 'sent',
        createdAt: 1791676800000
      })
      const parentBefore = await rawRejudgeRow(env, postId)
      const childBefore = await candidateRow(env, linkedId)
      expect(await conflictOf(rejudgeWebhookJob(env, postId))).toEqual({
        status: 409,
        message: 'Candidate cannot be re-judged'
      })
      expect(await rawRejudgeRow(env, postId)).toEqual(parentBefore)
      expect(await candidateRow(env, linkedId)).toEqual(childBefore)
      expect(sent).toEqual([])
    })
  }, 60000)
})

describe('操作の可否（画面とサーバーで同じ規則）', () => {
  const linked = ['manually_linked']
  const auto = ['title_generated']
  const rejected = ['manually_rejected']
  const table: ReadonlyArray<
    readonly [string, string, readonly string[], { canLink: boolean; canRejudge: boolean; canResolve: boolean }]
  > = [
    ['registered + manually_linked', 'registered', linked, { canLink: true, canRejudge: true, canResolve: false }],
    ['registered + auto_linked', 'registered', ['auto_linked'], { canLink: true, canRejudge: true, canResolve: false }],
    ['registered + 自動登録', 'registered', auto, { canLink: true, canRejudge: true, canResolve: false }],
    ['registered + 理由なし', 'registered', [], { canLink: true, canRejudge: true, canResolve: false }],
    ['registered + manually_rejected', 'registered', rejected, { canLink: true, canRejudge: false, canResolve: false }],
    ['held', 'held', ['needs_review'], { canLink: true, canRejudge: true, canResolve: true }],
    ['ignored', 'ignored', ['not_distribution_event'], { canLink: true, canRejudge: true, canResolve: false }],
    ['ignored + manually_rejected', 'ignored', rejected, { canLink: true, canRejudge: false, canResolve: false }],
    ['failed', 'failed', [], { canLink: false, canRejudge: true, canResolve: false }],
    ['failed + manually_rejected', 'failed', rejected, { canLink: false, canRejudge: false, canResolve: false }],
    ['queued', 'queued', [], { canLink: false, canRejudge: false, canResolve: false }],
    ['processing', 'processing', [], { canLink: false, canRejudge: false, canResolve: false }]
  ]

  test.each(table)('%s', (_label, status, reasons, expected) => {
    expect(webhookActionAvailability(status, 'sent', reasons)).toMatchObject(expected)
  })

  test('登録済み以外（処理中など）では、manually_linked を持っていても判定し直せない', () => {
    for (const status of ['queued', 'processing']) {
      expect(webhookActionAvailability(status, 'sent', linked).canRejudge).toBe(false)
      expect(webhookActionAvailability(status, 'sent', linked).canLink).toBe(false)
    }
    expect(webhookActionAvailability('ignored', 'skipped', [...linked, ...rejected]).canRejudge).toBe(false)
  })

  test('失敗したジョブは再実行（canRejudge）できるが、manually_linked を持っていても連携はできない。通知の再送の規則は変わらない', () => {
    expect(webhookActionAvailability('failed', 'pending', linked).canRejudge).toBe(true)
    expect(webhookActionAvailability('failed', 'pending', linked).canLink).toBe(false)
    expect(webhookActionAvailability('registered', 'failed', linked)).toEqual({
      canResolve: false,
      canLink: true,
      canRejudge: true,
      canRetryNotification: true
    })
  })
})

describe('受信詳細の画面', () => {
  test('登録済みでは連携が使え、「再実行」は理由によらず押せる(押せない状態の理由は確認ダイアログに出る)。対象外にするは使えない', async () => {
    const linked = await renderDetail({ ...baseJob, status: 'registered', reasons: ['manually_linked'] })
    expect(buttonState(linked, LINK_LABEL)).toBe('enabled')
    expect(buttonState(linked, REJUDGE_LABEL)).toBe('enabled')
    expect(buttonState(linked, '対象外にする')).toBe('disabled')
    const auto = await renderDetail({ ...baseJob, status: 'registered', reasons: ['title_generated'] })
    expect(buttonState(auto, LINK_LABEL)).toBe('enabled')
    expect(buttonState(auto, REJUDGE_LABEL)).toBe('enabled')
    expect(buttonState(auto, '対象外にする')).toBe('disabled')
  })

  test('連携ダイアログは、登録済みのときだけ連携先を置き換える旨と、元のイベントを変更しない旨を説明に足す', async () => {
    const dialog = await Bun.file('workers/web/src/app/components/admin/webhook-event-link-dialog.tsx').text()
    const detail = await Bun.file('workers/web/src/app/components/admin/webhook-job-detail.tsx').text()
    expect(dialog).toContain(
      "{replacing && '登録済みのため、現在の連携先を置き換えます（元のイベントの内容は変更しません）。'}"
    )
    expect(detail).toContain("replacing={job !== undefined && job.status === 'registered'}")
  })
})
