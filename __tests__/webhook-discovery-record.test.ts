import { expect, test } from 'bun:test'
import { aggregateWebhookDiscovery } from '@api/services/webhook-discovery-aggregate'
import { recordWebhookDiscovery, storedWebhookDiscovery } from '@api/services/webhook-discovery-record'
import { getWebhookJob, insertWebhookJob, listWebhookJobs } from '@api/services/webhook-jobs'
import type { WebhookDiscovery } from '@biccame/shared/schemas/webhook.dto'
import { makeJob, withRejudgeEnv } from './fixtures/webhook-d1-jobs'

const detected: WebhookDiscovery = {
  relevance: 'detected',
  action: 'review',
  confidence: 0.96,
  evidence: ['model_event_confirmed'],
  missingFields: ['conditions'],
  reasons: ['distribution_condition_unspecified']
}

test('原回答と登録理由を保存し、検出済みを登録可能へ強制しない', () => {
  const decision = { status: 'held', confidence: 0.96, reasons: ['distribution_condition_unspecified'] } as const
  const saved = recordWebhookDiscovery(
    makeJob().post,
    { is_event: { type: 'noul', noul: 0.96 } },
    {
      ...decision,
      reasons: [...decision.reasons]
    }
  )
  expect(saved.relevance).toBe('detected')
  expect(saved.action).toBe('review')
  expect(saved.missingFields).toContain('conditions')
  expect(saved.confidence).toBe(0.96)
  expect(storedWebhookDiscovery(JSON.stringify({ ...decision, discovery: saved }))).toEqual(saved)
  for (const legacy of [null, undefined, '{}', '{broken', '{"status":"held","confidence":0.99,"reasons":[]}']) {
    expect(storedWebhookDiscovery(legacy)).toBeNull()
  }
})

test('不完全な子候補を陰性へ変換せず、検出済みを第一候補の陰性で隠さない', () => {
  const negative: WebhookDiscovery = { ...detected, relevance: 'not_detected', action: 'none', missingFields: [] }
  expect(aggregateWebhookDiscovery(null, [{ discovery: negative }, { discovery: detected }])).toMatchObject({
    relevance: 'detected'
  })
  expect(aggregateWebhookDiscovery(null, [{ discovery: negative }, {}])).toMatchObject({
    relevance: 'uncertain',
    action: 'review'
  })
  expect(aggregateWebhookDiscovery(null, [{ discovery: negative }])).toMatchObject({
    relevance: 'not_detected',
    action: 'none'
  })
  expect(aggregateWebhookDiscovery(null, [{}])).toBeNull()
})

test('保存された検出結果を一覧・詳細へ保持し、独立フィルターと旧判定を分ける', async () => {
  await withRejudgeEnv(async (env) => {
    const base = makeJob().post
    const cases = [
      { id: '2110000000000000010', discovery: detected },
      { id: '2110000000000000020', discovery: { ...detected, relevance: 'uncertain', confidence: null } },
      { id: '2110000000000000030', discovery: { ...detected, relevance: 'not_detected', action: 'none' } }
    ] as const
    for (const item of cases) {
      await insertWebhookJob(env, { ...base, id: item.id, url: `https://x.com/bic_akiba/status/${item.id}` })
      await env.DB.prepare("UPDATE webhook_event_jobs SET status='held',result_json=? WHERE post_id=?")
        .bind(JSON.stringify({ status: 'held', confidence: 0.96, reasons: [], discovery: item.discovery }), item.id)
        .run()
    }
    const legacyId = '2110000000000000040'
    await insertWebhookJob(env, { ...base, id: legacyId, url: `https://x.com/bic_akiba/status/${legacyId}` })
    const corruptId = '2110000000000000050'
    await insertWebhookJob(env, { ...base, id: corruptId, url: `https://x.com/bic_akiba/status/${corruptId}` })
    await env.DB.prepare('UPDATE webhook_event_jobs SET result_json=? WHERE post_id=?')
      .bind(JSON.stringify({ discovery: { ...detected, evidence: [1] } }), corruptId)
      .run()
    const detail = await getWebhookJob(env, cases[0].id)
    expect(detail.discovery).toEqual(detected)
    expect(detail.candidate).toBeNull()
    for (const item of cases) {
      const page = await listWebhookJobs(env, { limit: 25, discovery: item.discovery.relevance })
      expect(page.jobs.map((job) => job.postId)).toEqual([item.id])
      expect(page.jobs[0]?.discovery).toEqual(item.discovery)
    }
    const unrecorded = await listWebhookJobs(env, { limit: 25, discovery: 'unrecorded' })
    expect(unrecorded.jobs.map((job) => job.postId)).toEqual([corruptId, legacyId])
    expect(unrecorded.jobs[0]?.discovery).toBeNull()
  })
})

test('親の表示・絞り込みは全子の検出判定を集約する', async () => {
  await withRejudgeEnv(async (env) => {
    const base = makeJob().post
    await insertWebhookJob(env, base)
    const negative: WebhookDiscovery = { ...detected, relevance: 'not_detected', action: 'none' }
    for (const [index, discovery] of [negative, detected].entries()) {
      await env.DB.prepare(`INSERT INTO webhook_event_candidates
        (event_uuid,post_id,item,post_json,source_url,status,result_json,created_at,updated_at)
        VALUES (?,?,?,?,?,'held',?,?,?)`)
        .bind(
          crypto.randomUUID(),
          base.id,
          `候補${index}`,
          JSON.stringify(base),
          base.url,
          JSON.stringify({ status: 'held', confidence: discovery.confidence, reasons: [], discovery }),
          index,
          index
        )
        .run()
    }
    expect((await getWebhookJob(env, base.id)).discovery?.relevance).toBe('detected')
    expect((await listWebhookJobs(env, { limit: 25, discovery: 'detected' })).jobs.map((job) => job.postId)).toEqual([
      base.id
    ])
    expect((await listWebhookJobs(env, { limit: 25, discovery: 'not_detected' })).jobs).toEqual([])
  })
})
