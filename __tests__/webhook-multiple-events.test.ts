import { expect, spyOn, test } from 'bun:test'
import * as discord from '@api/services/discord'
import { getWebhookJob, insertWebhookJob } from '@api/services/webhook-jobs'
import { processWebhookJob } from '@api/services/webhook-process'
import { getWebhookPrompt } from '@api/services/webhook-prompt'
import type { EventDetectionNotification } from '@biccame/shared/bot'
import type { ClefRequest } from '@biccame/shared/event-detect/clef'
import { ClefRequestSchema } from '@biccame/shared/event-detect/clef'
import { answer, fixture, makePost, migrate } from './fixtures/webhook-multiple-events'

const SHARED_TEXT = '本日から船橋店と秋葉原店でふなとーたんと川崎たんの記念アクリルキーホルダーを全員に配布します。'
const SINGLE_TEXT = '本日から船橋店でふなとーたんの記念アクリルキーホルダーを全員に配布します。'

/** 判定の送信を記録し、配布数の質問は固定で返すフェイクの AI。回答は picks で決める。 */
const recordingAi = (
  base: { run: (model: string, raw: unknown) => Promise<unknown> },
  picks: { character?: string },
  requests: ClefRequest[]
) => ({
  run: async (model: string, raw: unknown) => {
    const parsed = ClefRequestSchema.safeParse(raw)
    if (!parsed.success) throw new Error('Invalid batched request')
    requests.push(parsed.data)
    return parsed.data.questions.distribution_item_count === undefined
      ? answer(parsed.data, picks)
      : base.run(model, raw)
  }
})

test('共同デザイン（娘が複数）は店舗ごとの候補で multiple を選び、対象の娘を決めず保留にする', async () => {
  const { cleanup, env } = await fixture('independent-store-character-shared')
  const delivery = spyOn(discord, 'notifyEventDetection').mockResolvedValue({ status: 'sent', messageId: '1234567890' })
  const requests: ClefRequest[] = []
  const target = Object.assign({}, env, { AI: recordingAi(env.AI, { character: 'multiple' }, requests) })
  try {
    await migrate(env.DB)
    const post = { ...makePost('2109221721773576690', SHARED_TEXT), screenName: 'bic_funabashi' }
    await insertWebhookJob(target, post)
    await processWebhookJob(target, post.id, {
      extractor: async () => ({
        events: [
          {
            item: '記念アクリルキーホルダー',
            stores: ['funabashi', 'akiba'],
            characterIds: ['funato', 'kawasaki'],
            evidence: [post.text]
          }
        ]
      })
    })
    // 件数の質問 1 回 + 店舗ごとの候補の判定 1 回ずつ。判定は 1 バッチで 64 問以内。
    const judged = requests.filter((request) => request.questions.is_event !== undefined)
    expect(requests).toHaveLength(3)
    expect(judged.every((request) => Object.keys(request.questions).length <= 64)).toBe(true)
    // 各候補の判定には、その候補自身の店舗が抽出段階の開催店舗候補として渡る。
    expect(judged.map((request) => request.state.match(/抽出段階の開催店舗候補（未確定）: (\S+)/)?.[1])).toEqual([
      'funabashi',
      'akiba'
    ])
    // 店舗（store）と対象の娘（character）は独立した choice で、ふなとーたん（funato）と船橋店の娘（funabashi）は別の選択肢。
    const character = judged[0].questions.character
    expect(character.type === 'choice' ? Object.keys(character.criteria) : []).toEqual(
      expect.arrayContaining(['funato', 'funabashi', 'kawasaki', 'multiple', 'none'])
    )
    expect(judged[0].questions['character.funato']).toBeUndefined()
    const job = await getWebhookJob(target, post.id)
    expect(job.candidates.map((candidate) => candidate.storeKey)).toEqual(['funabashi', 'akiba'])
    expect(job.candidates.map((candidate) => candidate.item)).toEqual([
      '記念アクリルキーホルダー',
      '記念アクリルキーホルダー'
    ])
    expect(job.candidates.map((candidate) => candidate.status)).toEqual(['held', 'held'])
    for (const candidate of job.candidates) {
      expect(candidate.reasons).toContain('character_unconfirmed')
      expect(candidate.reasons).not.toContain('store_unconfirmed')
      expect(candidate.candidate).toBeNull()
      expect(candidate.answers?.character).toMatchObject({ type: 'choice', choice: 'multiple' })
    }
    expect(job.candidates.map((candidate) => candidate.answers?.store)).toMatchObject([
      { type: 'choice', choice: 'funabashi' },
      { type: 'choice', choice: 'akiba' }
    ])
    // 候補ごとに送信入力は 1 件。親ジョブの送信入力は件数の質問だけ。
    expect((await getWebhookPrompt(target, post.id)).requests).toEqual(requests.slice(0, 1))
    expect((await getWebhookPrompt(target, post.id, job.candidates[0].eventUUID)).requests).toEqual(
      requests.slice(1, 2)
    )
    expect((await getWebhookPrompt(target, post.id, job.candidates[1].eventUUID)).requests).toEqual(
      requests.slice(2, 3)
    )
    expect(await target.DB.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(0)
  } finally {
    delivery.mockRestore()
    await cleanup()
  }
}, 60000)

test('娘が 1 人なら店舗とは独立に funato のまま登録し、船橋店の娘（funabashi）に置き換えない', async () => {
  const { cleanup, env } = await fixture('independent-store-character-single')
  const notifications: EventDetectionNotification[] = []
  const delivery = spyOn(discord, 'notifyEventDetection').mockImplementation(async (_env, input) => {
    notifications.push(input)
    return { status: 'sent', messageId: '1234567890' }
  })
  const requests: ClefRequest[] = []
  const target = Object.assign({}, env, { AI: recordingAi(env.AI, { character: 'funato' }, requests) })
  try {
    await migrate(env.DB)
    const post = { ...makePost('2109221721773576692', SINGLE_TEXT), screenName: 'bic_funabashi' }
    await insertWebhookJob(target, post)
    await processWebhookJob(target, post.id, {
      extractor: async () => ({
        events: [
          { item: '記念アクリルキーホルダー', stores: ['funabashi'], characterIds: ['funato'], evidence: [post.text] }
        ]
      })
    })
    const candidate = (await getWebhookJob(target, post.id)).candidates[0]
    expect(candidate.status).toBe('registered')
    expect(candidate.candidate?.stores).toEqual(['funabashi'])
    expect(candidate.candidate?.characterIds).toEqual(['funato'])
    expect(candidate.answers?.character).toMatchObject({ type: 'choice', choice: 'funato' })
    expect(await target.DB.prepare('SELECT count(*) AS total FROM event_characters').first<number>('total')).toBe(1)
    expect(notifications).toHaveLength(1)
    expect(notifications[0].stores).toContain('ビックカメラ船橋駅FACE店')
    expect(notifications[0].characters).toEqual(['ふなとーたん'])
    expect(notifications[0].characters).not.toContain('ふなたん')
  } finally {
    delivery.mockRestore()
    await cleanup()
  }
}, 60000)

test('判定の応答が不完全なら保存せず failed にし、送った 1 バッチだけを履歴に残す', async () => {
  const { cleanup, env } = await fixture('independent-store-character-incomplete')
  const delivery = spyOn(discord, 'notifyEventDetection').mockResolvedValue({ status: 'sent', messageId: '1234567890' })
  const incomplete = Object.assign({}, env, {
    AI: {
      run: async (model: string, raw: unknown) => {
        const parsed = ClefRequestSchema.safeParse(raw)
        if (!parsed.success) throw new Error('Invalid batched request')
        return parsed.data.questions.character === undefined ? env.AI.run(model, raw) : { answers: {} }
      }
    }
  })
  try {
    await migrate(env.DB)
    const post = { ...makePost('2109221721773576691', SINGLE_TEXT), screenName: 'bic_funabashi' }
    await insertWebhookJob(incomplete, post)
    await expect(
      processWebhookJob(incomplete, post.id, {
        extractor: async () => ({
          events: [{ item: '記念アクリルキーホルダー', stores: [], characterIds: [], evidence: [post.text] }]
        })
      })
    ).rejects.toThrow('Incomplete detection response')
    const failed = await getWebhookJob(incomplete, post.id)
    expect(failed.candidates[0].answers).toBeNull()
    expect(failed.candidates[0].status).toBe('failed')
    const prompt = await getWebhookPrompt(incomplete, post.id, failed.candidates[0].eventUUID)
    expect(prompt.requests).toHaveLength(1)
    expect(prompt.requests[0].questions.store).toBeDefined()
    expect(prompt.requests[0].questions.character).toBeDefined()
    expect(await incomplete.DB.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(0)
  } finally {
    delivery.mockRestore()
    await cleanup()
  }
}, 60000)

test('判定の送信が失敗した場合、送ろうとした 1 バッチだけを履歴に載せる', async () => {
  const { cleanup, env } = await fixture('prompt-partial-send')
  const sent: ClefRequest[] = []
  const target = Object.assign({}, env, {
    AI: {
      run: async (_model: string, raw: unknown) => {
        const parsed = ClefRequestSchema.safeParse(raw)
        if (!parsed.success) throw new Error('Invalid prompt request')
        sent.push(parsed.data)
        if (parsed.data.questions.is_event) throw new Error('Synthetic first-batch failure')
        return { answers: { distribution_item_count: { type: 'choice', choice: '1', probabilities: { '1': 0.99 } } } }
      }
    }
  })
  try {
    await migrate(env.DB)
    const source = makePost('2112431406978945273', '本日から記念アクリルキーホルダーを全員に配布します。')
    await insertWebhookJob(target, source)
    await expect(
      processWebhookJob(target, source.id, {
        extractor: async () => ({
          events: [{ item: '記念アクリルキーホルダー', stores: [], characterIds: [], evidence: [source.text] }]
        })
      })
    ).rejects.toThrow('Synthetic first-batch failure')
    const failed = await getWebhookJob(target, source.id)
    const snapshot = await getWebhookPrompt(target, source.id, failed.candidates[0].eventUUID)
    expect(snapshot.requests).toEqual(sent.slice(1))
    expect(snapshot.requests).toHaveLength(1)
    expect(snapshot.requests[0].questions['character.funato']).toBeUndefined()
    expect(snapshot.requests[0].questions.character).toBeDefined()
    expect(failed.candidates[0].answers).toBeNull()
  } finally {
    await cleanup()
  }
}, 60000)
