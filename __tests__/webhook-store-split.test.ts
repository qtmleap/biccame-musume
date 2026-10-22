import { expect, spyOn, test } from 'bun:test'
import * as discord from '@api/services/discord'
import { rejudgeWebhookJob } from '@api/services/webhook-admin'
import { getWebhookJob, insertWebhookJob } from '@api/services/webhook-jobs'
import { processWebhookJob } from '@api/services/webhook-process'
import type { EventDetectionNotification } from '@biccame/shared/bot'
import { detectionStores } from '@biccame/shared/event-detect/associations'
import { ClefRequestSchema } from '@biccame/shared/event-detect/clef'
import { hintedStore } from './fixtures/webhook-answer'
import { fixture, makePost, migrate } from './fixtures/webhook-multiple-events'

// 合同の限定名刺（1 件の抽出イベントに複数店舗）は、コードが店舗ごとの候補へ決定的に分ける。1 イベントは 1 店舗。
const STORES = ['nanba', 'abeno', 'yao', 'takatsuki'] as const

test('複数店舗の抽出イベント 1 件は店舗ごとの 4 候補になり、各候補が 1 店舗のイベントとして登録される', async () => {
  const { cleanup, env, calls } = await fixture('store-split-four-stores')
  const notifications: EventDetectionNotification[] = []
  const delivery = spyOn(discord, 'notifyEventDetection').mockImplementation(async (_env, input) => {
    notifications.push(input)
    return { status: 'sent', messageId: '1234567890' }
  })
  try {
    await migrate(env.DB)
    for (const id of STORES) expect(detectionStores.some((store) => store.id === id)).toBe(true)
    const text = '本日からなんば店・あべの店・八尾店・高槻店でアキバたんの合同限定名刺をどなたでも配布します。'
    const post = makePost('2112378276735750701', text)
    await insertWebhookJob(env, post)
    // 抽出は 1 件のまま（stores が 4 つ）。対象の娘は 4 店舗とも同じ 1 人。
    await processWebhookJob(env, post.id, {
      extractor: async () => ({
        events: [{ item: '合同限定名刺', stores: [...STORES], characterIds: ['akiba'], evidence: [text] }]
      })
    })
    const job = await getWebhookJob(env, post.id)
    // 候補は店舗ごとに 4 件。item は同じで、(item, storeKey) の組で区別される。
    expect(job.candidates).toHaveLength(4)
    expect(job.candidates.map((candidate) => candidate.item)).toEqual(Array(4).fill('合同限定名刺'))
    expect(job.candidates.map((candidate) => candidate.storeKey)).toEqual([...STORES])
    // 各候補の判定には、その候補自身の店舗だけが抽出段階の開催店舗候補として渡る。
    expect(calls.map((state) => /抽出段階の開催店舗候補（未確定）: (\S+)/.exec(state)?.[1])).toEqual([...STORES])
    expect(job.candidates.map((candidate) => candidate.answers?.store)).toMatchObject(
      STORES.map((choice) => ({ type: 'choice', choice }))
    )
    // 4 件とも登録され、店舗が 1 つずつのイベントになる。店舗違いなので互いに重複扱いにならない。
    expect(job.candidates.map((candidate) => candidate.status)).toEqual(Array(4).fill('registered'))
    expect(job.candidates.map((candidate) => candidate.candidate?.stores)).toEqual(STORES.map((store) => [store]))
    expect(job.candidates.map((candidate) => candidate.candidate?.characterIds)).toEqual(Array(4).fill(['akiba']))
    for (const candidate of job.candidates)
      expect(candidate.reasons.filter((reason) => reason.startsWith('possible_duplicate'))).toEqual([])
    const keys = (
      await env.DB.prepare('SELECT semantic_key AS key FROM webhook_event_candidates WHERE post_id=?')
        .bind(post.id)
        .all<{ key: string | null }>()
    ).results.map((row) => row.key)
    expect(keys.every((key) => key !== null)).toBe(true)
    expect(new Set(keys).size).toBe(4)
    expect(await env.DB.prepare('SELECT COUNT(*) AS total FROM events').first<number>('total')).toBe(4)
    const perEvent = (
      await env.DB.prepare(
        'SELECT store_key AS store, COUNT(*) OVER (PARTITION BY event_id) AS n FROM event_stores'
      ).all<{ store: string; n: number }>()
    ).results
    expect(perEvent.map((row) => row.n)).toEqual([1, 1, 1, 1])
    expect(perEvent.map((row) => row.store).sort()).toEqual(STORES.slice().sort())
    // 件数監査は抽出イベントの数で数え、分割後の候補数と混同しない。抽出の保存形式も分割しない。
    expect(job.itemCountAudit).toMatchObject({ extracted: 1, candidates: 1, status: 'matched' })
    expect(job.reasons).not.toContain('distribution_item_count_mismatch')
    const stored = await env.DB.prepare('SELECT extraction_json FROM webhook_event_jobs WHERE post_id=?')
      .bind(post.id)
      .first<string>('extraction_json')
    const events: unknown = stored === null ? null : JSON.parse(stored).events
    expect(events).toEqual([{ item: '合同限定名刺', stores: [...STORES], characterIds: ['akiba'], evidence: [text] }])
    expect(notifications.map((notification) => notification.candidate?.total)).toEqual(Array(4).fill(4))
    expect(notifications.map((notification) => notification.candidate?.index)).toEqual([1, 2, 3, 4])
  } finally {
    delivery.mockRestore()
    await cleanup()
  }
}, 60000)

test('抽出段階の店舗と store の選択が食い違う候補は、候補なしで store_mismatch の保留になる', async () => {
  const { cleanup, env, state } = await fixture('store-split-mismatch')
  const delivery = spyOn(discord, 'notifyEventDetection').mockResolvedValue({ status: 'sent', messageId: '1234567890' })
  try {
    await migrate(env.DB)
    // 抽出は秋葉原、判定の AI は あべの を選ぶ。どちらが正しいか人が確認する。
    state.picks = { store: 'abeno' }
    const post = makePost('2112378276735750702', '本日からアキバたんの限定名刺をどなたでも配布します。')
    await insertWebhookJob(env, post)
    await processWebhookJob(env, post.id, {
      extractor: async () => ({
        events: [{ item: '限定名刺', stores: ['akiba'], characterIds: ['akiba'], evidence: [post.text] }]
      })
    })
    const candidate = (await getWebhookJob(env, post.id)).candidates[0]
    expect(candidate.storeKey).toBe('akiba')
    expect(candidate.status).toBe('held')
    expect(candidate.reasons).toContain('store_mismatch')
    expect(candidate.reasons).not.toContain('store_unconfirmed')
    expect(candidate.candidate).toBeNull()
    expect(candidate.answers?.store).toMatchObject({ type: 'choice', choice: 'abeno' })
    expect(await env.DB.prepare('SELECT COUNT(*) AS total FROM events').first<number>('total')).toBe(0)
  } finally {
    delivery.mockRestore()
    await cleanup()
  }
}, 60000)

test('同じ item の候補が店舗違いで複数あっても、再判定は (item, storeKey) の組で原文参考を復元する', async () => {
  const base = await fixture('store-split-rejudge-context')
  const delivery = spyOn(discord, 'notifyEventDetection').mockResolvedValue({ status: 'sent', messageId: '1234567890' })
  // 件数監査を低確度にして、全候補を保留（再判定できる状態）にする。Object.assign は env.AI を書き換えるので、元の run を先に控える。
  const baseRun = base.env.AI.run
  const env = Object.assign(base.env, {
    AI: {
      run: async (model: string, raw: unknown) => {
        const parsed = ClefRequestSchema.safeParse(raw)
        if (!parsed.success) throw new Error('Invalid request')
        return parsed.data.questions.distribution_item_count === undefined
          ? baseRun(model, raw)
          : { answers: { distribution_item_count: { type: 'choice', choice: '1', probabilities: { '1': 0.82 } } } }
      }
    }
  })
  try {
    await migrate(env.DB)
    const first = '11/1からあきばとあべので1,000円以上購入の限定名刺を配布します。'
    const second = '11/2からなんばで3,000円以上購入の限定名刺を配布します。'
    const post = makePost('2112378276735750703', `${first}\n${second}`)
    await insertWebhookJob(env, post)
    await processWebhookJob(env, post.id, {
      extractor: async () => ({
        events: [
          { item: '限定名刺', stores: ['akiba', 'abeno'], characterIds: ['akiba'], evidence: [first] },
          { item: '限定名刺', stores: ['nanba'], characterIds: ['akiba'], evidence: [second] }
        ]
      })
    })
    const saved = await getWebhookJob(env, post.id)
    expect(saved.candidates.map((candidate) => [candidate.item, candidate.storeKey])).toEqual([
      ['限定名刺', 'akiba'],
      ['限定名刺', 'abeno'],
      ['限定名刺', 'nanba']
    ])
    expect(saved.candidates.map((candidate) => candidate.status)).toEqual(['held', 'held', 'held'])
    expect(saved.candidates.map((candidate) => candidate.post.text)).toEqual([first, first, second])
    // 参考文脈を失った候補（原文のまま）にしてから再判定する。
    for (const candidate of saved.candidates) {
      await env.DB.prepare('UPDATE webhook_event_candidates SET post_json=? WHERE event_uuid=?')
        .bind(JSON.stringify(post), candidate.eventUUID)
        .run()
      await rejudgeWebhookJob(env, post.id, candidate.eventUUID)
    }
    await processWebhookJob(env, post.id)
    const result = await getWebhookJob(env, post.id)
    expect(result.candidates.map((candidate) => candidate.eventUUID)).toEqual(
      saved.candidates.map((candidate) => candidate.eventUUID)
    )
    expect(result.candidates.map((candidate) => candidate.post.extractionContext?.kind)).toEqual([
      'item',
      'item',
      'item'
    ])
    expect(result.candidates.map((candidate) => candidate.post.text)).toEqual([first, first, second])
    expect(result.candidates.map((candidate) => candidate.post.extractionContext?.originalText)).toEqual(
      Array(3).fill(post.text)
    )
    // 再判定でも、各候補の判定には自分の店舗だけが渡る。
    expect(base.calls.slice(-3).map((state) => hintedStore({ model: 'clef', state, questions: {} }))).toEqual([
      'akiba',
      'abeno',
      'nanba'
    ])
  } finally {
    delivery.mockRestore()
    await base.cleanup()
  }
}, 60000)
