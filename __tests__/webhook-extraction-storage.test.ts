import { expect, test } from 'bun:test'
import { persistWebhookExtractionCandidates } from '@api/services/webhook-extraction-candidates'
import { claimWebhookJob, getWebhookJob, insertWebhookJob, releaseWebhookJob } from '@api/services/webhook-jobs'
import { auditItemCount, type EventExtraction, EXTRACTION_VERSION } from '@biccame/shared/event-detect/extraction'
import { fixture, makePost, migrate } from './fixtures/webhook-multiple-events'

for (const scenario of [
  { id: '2112378276735750640', expectedCount: '1', probability: 0.82, expectedStatus: 'low_confidence' },
  { id: '2112378276735750641', expectedCount: '2', probability: 0.99, expectedStatus: 'mismatch' }
] as const) {
  test(`監査${scenario.expectedStatus}は記録だけして、抽出候補と根拠を永続化し、親の理由には入れない`, async () => {
    const { env, cleanup } = await fixture(`extraction-storage-${scenario.expectedStatus}`)
    try {
      await migrate(env.DB)
      const post = makePost(scenario.id, 'アキバたんの冬名刺を11/1から配布します。')
      const job = await insertWebhookJob(env, post)
      const token = await claimWebhookJob(env, post.id)
      if (token === null) throw new Error('Expected claimed job')
      const extraction: EventExtraction = {
        events: [{ item: '冬名刺', stores: ['akiba'], characterIds: ['akiba'], evidence: [post.text] }]
      }
      const audit = auditItemCount(
        extraction.events,
        {
          answers: {
            distribution_item_count: {
              type: 'choice',
              choice: scenario.expectedCount,
              probabilities: { [scenario.expectedCount]: scenario.probability }
            }
          }
        },
        0.9
      )
      await persistWebhookExtractionCandidates(env, job, token, extraction, audit)
      await releaseWebhookJob(env, post.id, token)
      const saved = await getWebhookJob(env, post.id)
      expect(saved.candidates).toHaveLength(1)
      expect(saved.status).toBe('processing')
      expect(saved.reasons).toEqual([])
      expect(saved.itemCountAudit?.status).toBe(scenario.expectedStatus)
      expect(saved.candidates[0].status).toBe('queued')
      expect(saved.candidates[0].post.text).toBe(post.text)
      expect(await env.DB.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(0)
    } finally {
      await cleanup()
    }
  })
}

test('同じitem名の別店舗候補でも本番persistのsingle-store hintを混ぜずに保存する', async () => {
  const { env, cleanup } = await fixture('extraction-storage-store-hint-parity')
  try {
    await migrate(env.DB)
    const first = '11/1からAKIBAで1,000円以上購入の限定名刺を配布します。'
    const second = '11/2からあべので3,000円以上購入の限定名刺を配布します。'
    const post = makePost('2112378276735750643', `${first}\n${second}`)
    const job = await insertWebhookJob(env, post)
    const token = await claimWebhookJob(env, post.id)
    if (token === null) throw new Error('Expected claimed job')
    const extraction: EventExtraction = {
      events: [
        { item: '限定名刺', stores: ['akiba'], characterIds: ['akiba'], evidence: [first] },
        { item: '限定名刺', stores: ['abeno'], characterIds: ['abeno'], evidence: [second] }
      ]
    }
    const audit = auditItemCount(
      extraction.events,
      { answers: { distribution_item_count: { type: 'choice', choice: '1', probabilities: { '1': 0.99 } } } },
      0.9
    )
    await persistWebhookExtractionCandidates(env, job, token, extraction, audit)
    await releaseWebhookJob(env, post.id, token)
    const saved = await env.DB.prepare(
      'SELECT item,store_key AS storeKey,post_json AS postJson FROM webhook_event_candidates WHERE post_id=? ORDER BY created_at'
    )
      .bind(post.id)
      .all<{ item: string; storeKey: string; postJson: string }>()
    expect(saved.results.map((row) => row.item)).toEqual(['限定名刺', '限定名刺'])
    expect(saved.results.map((row) => row.storeKey)).toEqual(['akiba', 'abeno'])
    expect(saved.results[0].postJson).toContain(first)
    expect(saved.results[1].postJson).toContain(second)
    const result = await getWebhookJob(env, post.id)
    expect(result.candidates.map((candidate) => candidate.storeKey)).toEqual(['akiba', 'abeno'])
    expect(result.candidates.map((candidate) => candidate.post.text)).toEqual([first, second])
  } finally {
    await cleanup()
  }
})

test('物品ゼロの文脈候補は物品数を水増しせず別に保存する', async () => {
  const { env, cleanup } = await fixture('extraction-storage-event-context')
  try {
    await migrate(env.DB)
    const post = makePost('2112378276735750642', 'アキバたんの展示を本日終了します。')
    const job = await insertWebhookJob(env, post)
    const token = await claimWebhookJob(env, post.id)
    if (token === null) throw new Error('Expected claimed job')
    const audit = auditItemCount(
      [],
      { answers: { distribution_item_count: { type: 'choice', choice: '0', probabilities: { '0': 0.99 } } } },
      0.9
    )
    await persistWebhookExtractionCandidates(env, job, token, { events: [] }, audit, 'giveaways-v2')
    await releaseWebhookJob(env, post.id, token)
    const saved = await getWebhookJob(env, post.id)
    expect(saved.candidates).toHaveLength(1)
    const envelope = await env.DB.prepare('SELECT extraction_json FROM webhook_event_jobs WHERE post_id=?')
      .bind(post.id)
      .first<string>('extraction_json')
    expect(envelope).toContain('"version":"giveaways-v2"')
    expect(envelope).toContain(`"contextVersion":"${EXTRACTION_VERSION}"`)
    expect(envelope).toContain('"events":[]')
    expect(envelope).toContain('"extracted":0')
    expect(envelope).toContain('"candidates":0')
    expect(await env.DB.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(0)
  } finally {
    await cleanup()
  }
})
