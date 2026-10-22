import { expect, spyOn, test } from 'bun:test'
import * as discord from '@api/services/discord'
import { getWebhookJob, insertWebhookJob } from '@api/services/webhook-jobs'
import { processWebhookJob } from '@api/services/webhook-process'
import { getWebhookPrompt } from '@api/services/webhook-prompt'
import { recheckWebhookJob } from '@api/services/webhook-recheck'
import { type ClefRequest, ClefRequestSchema } from '@biccame/shared/event-detect/clef'
import { DETECTION_VERSION } from '@biccame/shared/event-detect/detection'
import { fixture, makePost, migrate } from './fixtures/webhook-multiple-events'
import {
  databaseSnapshot,
  expectNoLease,
  recheckHarness,
  registerSingle,
  rowOf,
  statusOf
} from './fixtures/webhook-recheck'

// 確認（2 段目）の質問だけの呼び出しかどうか。1 段目の判定には is_event がある。
const isConfirm = (request: ClefRequest) => request.questions.is_event === undefined
type Yes = { value: number; fail: boolean }

/** 2 段目（確認）の「はい」の確率を差し替え、失敗させられる AI。1 段目と件数の質問は、元のフェイクの AI に任せる。 */
const withConfirmAi = (
  base: { run: (model: string, raw: unknown) => Promise<unknown> },
  yes: Yes,
  calls: ClefRequest[]
) => ({
  run: async (model: string, raw: unknown) => {
    const request = ClefRequestSchema.safeParse(raw)
    if (!request.success || request.data.questions.distribution_item_count !== undefined || !isConfirm(request.data))
      return base.run(model, raw)
    calls.push(request.data)
    if (yes.fail) throw new Error('Synthetic confirm failure')
    return {
      answers: Object.fromEntries(
        Object.keys(request.data.questions).map((key) => [key, { type: 'noul', noul: yes.value }])
      )
    }
  }
})

const TEXT = '本日からアキバたんの限定名刺をどなたでも配布します。'
const judge = async (env: Awaited<ReturnType<typeof fixture>>['env'], id: string) => {
  const post = makePost(id, TEXT)
  await insertWebhookJob(env, post)
  await processWebhookJob(env, post.id, {
    extractor: async () => ({ events: [{ item: '限定名刺', stores: ['akiba'], characterIds: [], evidence: [TEXT] }] })
  })
  return post
}

test('確認の「はい」が下限以上なら登録に進み、確認の質問・回答が保存され、送信入力は 1 段目と 2 段目の 2 件になる', async () => {
  const base = await fixture('confirm-pipeline-high')
  const delivery = spyOn(discord, 'notifyEventDetection').mockResolvedValue({ status: 'sent', messageId: '1234567890' })
  const calls: ClefRequest[] = []
  const env = Object.assign(base.env, { AI: withConfirmAi(base.env.AI, { value: 0.9, fail: false }, calls) })
  try {
    await migrate(env.DB)
    const post = await judge(env, '2112378276735750811')
    const candidate = (await getWebhookJob(env, post.id)).candidates[0]
    expect(candidate.status).toBe('registered')
    expect(candidate.questionVersion).toBe(DETECTION_VERSION)
    expect(candidate.answers?.store_confirm).toEqual({ type: 'noul', noul: 0.9 })
    expect(candidate.answers?.character_confirm).toEqual({ type: 'noul', noul: 0.9 })
    // 1 候補につき 2 段目は 1 回（店舗と娘をまとめて）。
    expect(calls).toHaveLength(1)
    expect(Object.keys(calls[0].questions)).toEqual(['store_confirm', 'character_confirm'])
    const prompt = await getWebhookPrompt(env, post.id, candidate.eventUUID)
    expect(prompt.questionVersion).toBe(DETECTION_VERSION)
    expect(prompt.requests).toHaveLength(2)
    expect(prompt.requests[1]).toEqual(calls[0])
    expect(prompt.definition?.questions.map((question) => question.key)).toEqual(
      expect.arrayContaining(['store_confirm', 'character_confirm'])
    )
  } finally {
    delivery.mockRestore()
    await base.cleanup()
  }
}, 60000)

test('確認の「はい」が下限未満なら、店舗・娘を確定せず保留し、理由に確認が低かったことが残る', async () => {
  const base = await fixture('confirm-pipeline-low')
  const delivery = spyOn(discord, 'notifyEventDetection').mockResolvedValue({ status: 'sent', messageId: '1234567890' })
  const env = Object.assign(base.env, { AI: withConfirmAi(base.env.AI, { value: 0.4, fail: false }, []) })
  try {
    await migrate(env.DB)
    const post = await judge(env, '2112378276735750812')
    const candidate = (await getWebhookJob(env, post.id)).candidates[0]
    expect(candidate.status).toBe('held')
    expect(candidate.candidate).toBeNull()
    expect(candidate.reasons).toEqual(
      expect.arrayContaining([
        'store_unconfirmed',
        'store_confirm_low',
        'character_unconfirmed',
        'character_confirm_low'
      ])
    )
    // 確認の回答は保存され、回答表で「はい」の確率を確かめられる。
    expect(candidate.answers?.store_confirm).toEqual({ type: 'noul', noul: 0.4 })
    expect(await env.DB.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(0)
  } finally {
    delivery.mockRestore()
    await base.cleanup()
  }
}, 60000)

test('2 段目が失敗したら例外で、回答・判定結果を保存せず、候補は failed になる（送信試行の入力だけが残る）', async () => {
  const base = await fixture('confirm-pipeline-failure')
  const calls: ClefRequest[] = []
  const env = Object.assign(base.env, { AI: withConfirmAi(base.env.AI, { value: 0.9, fail: true }, calls) })
  try {
    await migrate(env.DB)
    const post = makePost('2112378276735750813', TEXT)
    await insertWebhookJob(env, post)
    await expect(
      processWebhookJob(env, post.id, {
        extractor: async () => ({
          events: [{ item: '限定名刺', stores: ['akiba'], characterIds: [], evidence: [TEXT] }]
        })
      })
    ).rejects.toThrow('Synthetic confirm failure')
    expect(calls).toHaveLength(1)
    const job = await getWebhookJob(env, post.id)
    expect(job.candidates[0].status).toBe('failed')
    const row = await rowOf(env, 'webhook_event_candidates', 'event_uuid', job.candidates[0].eventUUID)
    // 1 段目の回答だけを部分的に保存しない。
    expect(row.answers_json).toBeNull()
    expect(row.result_json).toBeNull()
    expect(row.candidate_json).toBeNull()
    expect(job.eventId).toBeNull()
    // 送信前の入力は 1 段目・2 段目の順に記録されている（既存の流儀。全バッチが成功するまで回答は保存しない）。
    const prompt = await getWebhookPrompt(env, post.id, job.candidates[0].eventUUID)
    expect(prompt.requests).toHaveLength(2)
    expect(prompt.requests[1]).toEqual(calls[0])
    expect(await env.DB.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(0)
  } finally {
    await base.cleanup()
  }
}, 60000)

test('再判定（recheck）も 2 段目を含み、確認の回答を保存する', async () => {
  const { env, cleanup, ai } = await recheckHarness('confirm-recheck-includes')
  try {
    const post = await registerSingle(env, '2112378276735750821')
    const candidateId = (await getWebhookJob(env, post.id)).candidates[0].eventUUID
    const calls: ClefRequest[] = []
    const target = Object.assign({}, env, { AI: withConfirmAi({ run: ai.run }, { value: 0.85, fail: false }, calls) })
    ai.state.armed = true
    const job = await recheckWebhookJob(target, post.id)
    // 1 段目 + 2 段目。確認の質問は店舗と娘をまとめた 1 リクエスト。
    expect(ai.state.calls).toHaveLength(1)
    expect(calls).toHaveLength(1)
    expect(Object.keys(calls[0].questions)).toEqual(['store_confirm', 'character_confirm'])
    expect(job.candidates[0].answers?.store_confirm).toEqual({ type: 'noul', noul: 0.85 })
    expect(job.candidates[0].answers?.character_confirm).toEqual({ type: 'noul', noul: 0.85 })
    expect(job.candidates[0].questionVersion).toBe(DETECTION_VERSION)
    expect(job.candidates[0].status).toBe('registered')
    const prompt = await getWebhookPrompt(env, post.id, candidateId)
    expect(prompt.requests).toHaveLength(2)
  } finally {
    await cleanup()
  }
}, 60000)

test('再判定の 2 段目が失敗したら 502 で、行も送信入力も元のまま、リースも解放される', async () => {
  const { env, cleanup, ai, notifications, sent } = await recheckHarness('confirm-recheck-failure')
  try {
    const post = await registerSingle(env, '2112378276735750822')
    const candidateId = (await getWebhookJob(env, post.id)).candidates[0].eventUUID
    const candidateBefore = await rowOf(env, 'webhook_event_candidates', 'event_uuid', candidateId)
    const parentBefore = await rowOf(env, 'webhook_event_jobs', 'post_id', post.id)
    const databaseBefore = await databaseSnapshot(env)
    const notified = notifications.length
    const calls: ClefRequest[] = []
    const failing = Object.assign({}, env, { AI: withConfirmAi({ run: ai.run }, { value: 0.9, fail: true }, calls) })
    ai.state.armed = true
    expect(await statusOf(recheckWebhookJob(failing, post.id))).toEqual({ status: 502, message: 'AI re-check failed' })
    expect(calls).toHaveLength(1)
    // 1 段目は成功していても、回答・版・送信入力を含む行は 1 つも書き換わらない。
    expect(await rowOf(env, 'webhook_event_candidates', 'event_uuid', candidateId)).toEqual(candidateBefore)
    expect(await rowOf(env, 'webhook_event_jobs', 'post_id', post.id)).toEqual(parentBefore)
    expect(await databaseSnapshot(env)).toEqual(databaseBefore)
    await expectNoLease(env, post.id)
    expect(notifications).toHaveLength(notified)
    expect(sent).toEqual([])
  } finally {
    await cleanup()
  }
}, 60000)
