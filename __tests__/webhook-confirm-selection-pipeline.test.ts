import { expect, spyOn, test } from 'bun:test'
import * as discord from '@api/services/discord'
import { getWebhookJob, insertWebhookJob } from '@api/services/webhook-jobs'
import { processWebhookJob } from '@api/services/webhook-process'
import { getWebhookPrompt } from '@api/services/webhook-prompt'
import { type ClefRequest, ClefRequestSchema } from '@biccame/shared/event-detect/clef'
import { DETECTION_VERSION } from '@biccame/shared/event-detect/detection'
import { fixture, makePost, migrate } from './fixtures/webhook-multiple-events'

type Row = Record<string, unknown>
const rowOf = async (env: Awaited<ReturnType<typeof fixture>>['env'], table: string, column: string, id: string) => {
  const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE ${column}=?`).bind(id).first<Row>()
  if (row === null) throw new Error('Missing row')
  return row
}

// 確認（2 段目）の質問だけの呼び出しかどうか。1 段目の判定には is_event がある。
const isConfirm = (request: ClefRequest) => request.questions.is_event === undefined
// byKey は、質問のキーごとに「はい」の確率を変えたいとき（例: 店舗の確認は高く、娘の確認は低く）に使う。
type Yes = { value: number; fail: boolean; byKey?: Record<string, number> }

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
        Object.keys(request.data.questions).map((key) => [
          key,
          { type: 'noul', noul: yes.byKey !== undefined && Object.hasOwn(yes.byKey, key) ? yes.byKey[key] : yes.value }
        ])
      )
    }
  }
})

// 1 段目の最上位の確率。70% 以上は確認を聞かずに確定するので、確認（2 段目）を調べるテストは 70% 未満にする。
const UNCERTAIN = 0.6
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
  base.state.picks = { probability: UNCERTAIN }
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
    // 既定の AI は店舗も娘もアキバ（店舗の娘）を選ぶが、店舗と娘は二回チェックするので、娘の確認も聞いて回答を保存する。
    expect(candidate.answers?.character_confirm).toEqual({ type: 'noul', noul: 0.9 })
    expect(candidate.candidate?.characterIds).toEqual(['akiba'])
    // 1 候補につき 2 段目は 1 回（店舗と娘の確認を 1 リクエストにまとめる）。
    expect(calls).toHaveLength(1)
    expect(Object.keys(calls[0].questions)).toEqual(['store_confirm', 'character_confirm'])
    expect(calls[0].state.split('\n').slice(-2)).toEqual([
      '確認対象の開催店舗: AKIBA店',
      '確認対象のビッカメ娘: アキバたん'
    ])
    const prompt = await getWebhookPrompt(env, post.id, candidate.eventUUID)
    expect(prompt.questionVersion).toBe(DETECTION_VERSION)
    expect(prompt.requests).toHaveLength(2)
    expect(prompt.requests[1]).toEqual(calls[0])
    // 版の定義には、娘の確認も含めた全候補の質問が載る。
    expect(prompt.definition?.questions.map((question) => question.key)).toEqual(
      expect.arrayContaining(['store_confirm', 'character_confirm'])
    )
  } finally {
    delivery.mockRestore()
    await base.cleanup()
  }
}, 60000)

test('店舗と別の娘なら、店舗と娘の確認を 1 リクエストにまとめて聞き、両方の回答が保存される', async () => {
  const base = await fixture('confirm-pipeline-other-character')
  const delivery = spyOn(discord, 'notifyEventDetection').mockResolvedValue({ status: 'sent', messageId: '1234567890' })
  const calls: ClefRequest[] = []
  const env = Object.assign(base.env, { AI: withConfirmAi(base.env.AI, { value: 0.9, fail: false }, calls) })
  base.state.picks = { character: 'funato', probability: UNCERTAIN }
  try {
    await migrate(env.DB)
    const post = await judge(env, '2112378276735750814')
    const candidate = (await getWebhookJob(env, post.id)).candidates[0]
    expect(candidate.status).toBe('registered')
    expect(candidate.candidate?.characterIds).toEqual(['funato'])
    expect(calls).toHaveLength(1)
    expect(Object.keys(calls[0].questions)).toEqual(['store_confirm', 'character_confirm'])
    expect(candidate.answers?.store_confirm).toEqual({ type: 'noul', noul: 0.9 })
    expect(candidate.answers?.character_confirm).toEqual({ type: 'noul', noul: 0.9 })
  } finally {
    delivery.mockRestore()
    await base.cleanup()
  }
}, 60000)

test('確認の「はい」が下限未満なら、店舗を確定せず保留し、理由に確認が低かったことが残る（店舗が採用されないので店舗の娘にもできない）', async () => {
  const base = await fixture('confirm-pipeline-low')
  base.state.picks = { probability: UNCERTAIN }
  const delivery = spyOn(discord, 'notifyEventDetection').mockResolvedValue({ status: 'sent', messageId: '1234567890' })
  const env = Object.assign(base.env, { AI: withConfirmAi(base.env.AI, { value: 0.4, fail: false }, []) })
  try {
    await migrate(env.DB)
    const post = await judge(env, '2112378276735750812')
    const candidate = (await getWebhookJob(env, post.id)).candidates[0]
    expect(candidate.status).toBe('held')
    expect(candidate.candidate).toBeNull()
    // 店舗の娘にも娘の確認を聞く。店舗が採用されない保留なので、娘は店舗の娘にできず、確認が低かったことも併記される。
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
    expect(candidate.answers?.character_confirm).toEqual({ type: 'noul', noul: 0.4 })
    expect(await env.DB.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(0)
  } finally {
    delivery.mockRestore()
    await base.cleanup()
  }
}, 60000)

test('店舗と別の娘で確認の「はい」が下限未満なら、店舗・娘とも確定せず保留し、両方の理由が残る', async () => {
  const base = await fixture('confirm-pipeline-low-other-character')
  const delivery = spyOn(discord, 'notifyEventDetection').mockResolvedValue({ status: 'sent', messageId: '1234567890' })
  const env = Object.assign(base.env, { AI: withConfirmAi(base.env.AI, { value: 0.4, fail: false }, []) })
  base.state.picks = { character: 'funato', probability: UNCERTAIN }
  try {
    await migrate(env.DB)
    const post = await judge(env, '2112378276735750815')
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
    expect(candidate.answers?.character_confirm).toEqual({ type: 'noul', noul: 0.4 })
  } finally {
    delivery.mockRestore()
    await base.cleanup()
  }
}, 60000)

test('店舗の娘で、店舗の確認は通り娘の確認だけが下限未満でも、保留せず店舗の娘で登録する（判定は変わらない）', async () => {
  const base = await fixture('confirm-pipeline-low-store-character-only')
  base.state.picks = { probability: UNCERTAIN }
  const delivery = spyOn(discord, 'notifyEventDetection').mockResolvedValue({ status: 'sent', messageId: '1234567890' })
  const calls: ClefRequest[] = []
  const env = Object.assign(base.env, {
    AI: withConfirmAi(base.env.AI, { value: 0.9, fail: false, byKey: { character_confirm: 0.1 } }, calls)
  })
  try {
    await migrate(env.DB)
    const post = await judge(env, '2112378276735750817')
    const candidate = (await getWebhookJob(env, post.id)).candidates[0]
    // 既定の AI は店舗も娘もアキバ（店舗の娘）を選ぶ。娘の確認も聞くが、低くても店舗の娘のまま登録する。
    expect(Object.keys(calls[0].questions)).toEqual(['store_confirm', 'character_confirm'])
    expect(candidate.status).toBe('registered')
    expect(candidate.candidate?.stores).toEqual(['akiba'])
    expect(candidate.candidate?.characterIds).toEqual(['akiba'])
    expect(candidate.reasons).not.toContain('character_unconfirmed')
    expect(candidate.reasons).not.toContain('character_confirm_low')
    expect(candidate.answers?.store_confirm).toEqual({ type: 'noul', noul: 0.9 })
    expect(candidate.answers?.character_confirm).toEqual({ type: 'noul', noul: 0.1 })
  } finally {
    delivery.mockRestore()
    await base.cleanup()
  }
}, 60000)

test('店舗の確認は通り、店舗と別の娘の確認だけが下限未満なら、娘は明示されていないので保留せず店舗の娘で登録する', async () => {
  const base = await fixture('confirm-pipeline-low-character-only')
  const delivery = spyOn(discord, 'notifyEventDetection').mockResolvedValue({ status: 'sent', messageId: '1234567890' })
  const env = Object.assign(base.env, {
    AI: withConfirmAi(base.env.AI, { value: 0.9, fail: false, byKey: { character_confirm: 0.4 } }, [])
  })
  base.state.picks = { character: 'funato', probability: UNCERTAIN }
  try {
    await migrate(env.DB)
    const post = await judge(env, '2112378276735750816')
    const candidate = (await getWebhookJob(env, post.id)).candidates[0]
    expect(candidate.status).toBe('registered')
    expect(candidate.candidate?.stores).toEqual(['akiba'])
    // 1 段目は別の娘（funato）を選んだが、確認が低く本文から読めないので、採用した店舗（akiba）の娘になる。
    expect(candidate.candidate?.characterIds).toEqual(['akiba'])
    expect(candidate.reasons).not.toContain('character_unconfirmed')
    expect(candidate.reasons).not.toContain('character_confirm_low')
    // 確認の回答は保存され、回答表で「はい」の確率を確かめられる。
    expect(candidate.answers?.store_confirm).toEqual({ type: 'noul', noul: 0.9 })
    expect(candidate.answers?.character_confirm).toEqual({ type: 'noul', noul: 0.4 })
  } finally {
    delivery.mockRestore()
    await base.cleanup()
  }
}, 60000)

test('1 段目の最上位が 70% 以上なら確認を聞かず、確認の質問も回答も保存せず、そのまま登録する（呼び出しは 1 段目だけ）', async () => {
  const base = await fixture('confirm-pipeline-confident')
  const delivery = spyOn(discord, 'notifyEventDetection').mockResolvedValue({ status: 'sent', messageId: '1234567890' })
  const calls: ClefRequest[] = []
  const env = Object.assign(base.env, { AI: withConfirmAi(base.env.AI, { value: 0.01, fail: false }, calls) })
  try {
    await migrate(env.DB)
    const post = await judge(env, '2112378276735750818')
    const candidate = (await getWebhookJob(env, post.id)).candidates[0]
    // 既定の AI は店舗も娘も 99% でアキバを選ぶ。確認を聞かないので、確認の「はい」が低くても登録に進む（確認を見ない）。
    expect(calls).toHaveLength(0)
    expect(candidate.status).toBe('registered')
    expect(candidate.candidate?.stores).toEqual(['akiba'])
    expect(candidate.candidate?.characterIds).toEqual(['akiba'])
    expect(candidate.answers).not.toHaveProperty('store_confirm')
    expect(candidate.answers).not.toHaveProperty('character_confirm')
    const prompt = await getWebhookPrompt(env, post.id, candidate.eventUUID)
    expect(prompt.requests).toHaveLength(1)
  } finally {
    delivery.mockRestore()
    await base.cleanup()
  }
}, 60000)

test('2 段目が失敗したら例外で、回答・判定結果を保存せず、候補は failed になる（送信試行の入力だけが残る）', async () => {
  const base = await fixture('confirm-pipeline-failure')
  base.state.picks = { probability: UNCERTAIN }
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
