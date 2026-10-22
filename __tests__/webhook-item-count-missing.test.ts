import { expect, spyOn, test } from 'bun:test'
import * as discord from '@api/services/discord'
import { processWebhookCandidate } from '@api/services/webhook-candidate-process'
import { getWebhookJob, insertWebhookJob, webhookTarget } from '@api/services/webhook-jobs'
import { processWebhookJob } from '@api/services/webhook-process'
import { DetectionCandidateSchema } from '@biccame/shared/event-detect/detection'
import { auditItemCount, extractedPost } from '@biccame/shared/event-detect/extraction'
import { event } from './fixtures/webhook-d1-jobs'
import { fixture, makePost, migrate } from './fixtures/webhook-multiple-events'

const registerResult = () => {
  const candidate = DetectionCandidateSchema.safeParse({ ...event, startDate: '2026-10-11' })
  if (!candidate.success) throw new Error('Invalid cached candidate')
  return { status: 'register', confidence: 0.99, reasons: [], candidate: candidate.data }
}
const discovery = {
  relevance: 'detected',
  action: 'create',
  confidence: 0.99,
  evidence: ['model_event_confirmed'],
  missingFields: [],
  reasons: []
}

for (const variant of ['fresh-focused-null', 'fresh-focused-no-field', 'cached-new', 'cached-legacy'] as const) {
  test(`監査欠落境界 ${variant}: 新形式は停止し明示旧registerだけretryを維持`, async () => {
    const value = await fixture(`missing-audit-${variant}`)
    const delivery = spyOn(discord, 'notifyEventDetection').mockResolvedValue({
      status: 'sent',
      messageId: '1234567890'
    })
    try {
      await migrate(value.env.DB)
      const original = makePost('2110000000000000099', '本日から限定名刺をどなたでも配布します。')
      const focus = extractedPost(original, {
        item: '限定名刺',
        stores: ['akiba'],
        characterIds: ['akiba'],
        evidence: [original.text]
      })
      const isFresh = variant.startsWith('fresh')
      const input = isFresh ? focus : original
      const result = isFresh
        ? null
        : JSON.stringify({ ...registerResult(), ...(variant === 'cached-new' ? { discovery } : {}) })
      const extraction =
        variant === 'fresh-focused-null'
          ? null
          : JSON.stringify({
              version: variant === 'fresh-focused-no-field' ? 'giveaways-v6-focused-review' : 'legacy-single'
            })
      await insertWebhookJob(value.env, original)
      await value.env.DB.prepare('UPDATE webhook_event_jobs SET extraction_json=?,lease_token=? WHERE post_id=?')
        .bind(extraction, 'test-lease', original.id)
        .run()
      const candidateId = crypto.randomUUID()
      await value.env.DB.prepare(`INSERT INTO webhook_event_candidates
        (event_uuid,post_id,item,post_json,source_url,status,result_json,lease_token,created_at,updated_at)
        VALUES (?,?,?,?,?,'processing',?,?,0,0)`)
        .bind(candidateId, original.id, '限定名刺', JSON.stringify(input), original.url, result, 'test-lease')
        .run()
      await processWebhookCandidate(
        value.env,
        original.id,
        'test-lease',
        {
          titleFetcher: async () => {
            throw new Error('Network disabled in missing-audit test')
          }
        },
        webhookTarget(original.id, candidateId),
        '限定名刺',
        'akiba',
        variant === 'cached-legacy'
      )
      const saved = (await getWebhookJob(value.env, original.id)).candidates[0]
      if (variant === 'cached-legacy') {
        expect(saved.status).toBe('registered')
        expect(await value.env.DB.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(1)
      } else {
        expect(saved.status).toBe('held')
        expect(saved.reasons).toContain('distribution_item_count_unknown')
        expect(saved.discovery?.action).toBe('review')
        expect(saved.discovery?.missingFields).toContain('itemCountAudit')
        expect(saved.candidate).not.toBeNull()
        expect(await value.env.DB.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(0)
      }
    } finally {
      delivery.mockRestore()
      await value.cleanup()
    }
  })
}

test('監査一致でも壊れた新発見metadataを旧retryと誤認せず登録しない', async () => {
  const value = await fixture('new-invalid-discovery-matched-audit')
  const delivery = spyOn(discord, 'notifyEventDetection').mockResolvedValue({ status: 'sent', messageId: '1234567890' })
  try {
    await migrate(value.env.DB)
    const post = makePost('2110000000000000077', '本日から限定名刺をどなたでも配布します。')
    await insertWebhookJob(value.env, post)
    const audit = auditItemCount(
      [{ item: '限定名刺' }],
      {
        answers: {
          distribution_item_count: { type: 'choice', choice: '1', probabilities: { '1': 0.99 } }
        }
      },
      0.9
    )
    await value.env.DB.prepare('UPDATE webhook_event_jobs SET extraction_json=?,lease_token=? WHERE post_id=?')
      .bind(JSON.stringify({ version: 'legacy-single', itemCountAudit: audit }), 'test-lease', post.id)
      .run()
    const candidateId = crypto.randomUUID()
    await value.env.DB.prepare(`INSERT INTO webhook_event_candidates
      (event_uuid,post_id,item,post_json,source_url,status,result_json,lease_token,created_at,updated_at)
      VALUES (?,?,?,?,?,'processing',?,?,0,0)`)
      .bind(
        candidateId,
        post.id,
        '限定名刺',
        JSON.stringify(post),
        post.url,
        JSON.stringify({ ...registerResult(), discovery: {} }),
        'test-lease'
      )
      .run()
    await processWebhookCandidate(
      value.env,
      post.id,
      'test-lease',
      {},
      webhookTarget(post.id, candidateId),
      '限定名刺',
      'akiba',
      true
    )
    const saved = (await getWebhookJob(value.env, post.id)).candidates[0]
    expect(saved.status).toBe('held')
    expect(saved.reasons).toContain('auto_registration_not_allowed')
    expect(saved.discovery).toBeNull()
    expect(await value.env.DB.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(0)
  } finally {
    delivery.mockRestore()
    await value.cleanup()
  }
})

test('親監査の保存が失敗したら、先行した新候補もrollbackして監査無し候補を残さない', async () => {
  const value = await fixture('new-parent-audit-write-atomic')
  try {
    await migrate(value.env.DB)
    const post = makePost('2110000000000000066', '本日から限定名刺をどなたでも配布します。')
    await insertWebhookJob(value.env, post)
    await value.env.DB.exec(
      "CREATE TRIGGER reject_parent_audit BEFORE UPDATE OF extraction_json ON webhook_event_jobs WHEN NEW.extraction_json IS NOT NULL BEGIN SELECT RAISE(ABORT,'synthetic parent audit failure'); END;"
    )
    await expect(
      processWebhookJob(value.env, post.id, {
        extractor: async () => ({
          events: [{ item: '限定名刺', stores: ['akiba'], characterIds: ['akiba'], evidence: [post.text] }]
        })
      })
    ).rejects.toThrow()
    expect(
      await value.env.DB.prepare('SELECT extraction_json FROM webhook_event_jobs WHERE post_id=?')
        .bind(post.id)
        .first<string>('extraction_json')
    ).toBeNull()
    expect(
      await value.env.DB.prepare('SELECT count(*) AS total FROM webhook_event_candidates').first<number>('total')
    ).toBe(0)
    expect(await value.env.DB.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(0)
  } finally {
    await value.cleanup()
  }
})

test('新抽出の候補INSERTが失敗したら親の監査だけを保存せず、同一batchをrollbackする', async () => {
  const value = await fixture('new-extraction-audit-atomic')
  try {
    await migrate(value.env.DB)
    const post = makePost('2110000000000000088', '本日から限定名刺をどなたでも配布します。')
    await insertWebhookJob(value.env, post)
    await value.env.DB.exec(
      "CREATE TRIGGER reject_extraction_candidate BEFORE INSERT ON webhook_event_candidates BEGIN SELECT RAISE(ABORT,'synthetic candidate insert failure'); END;"
    )
    await expect(
      processWebhookJob(value.env, post.id, {
        extractor: async () => ({
          events: [{ item: '限定名刺', stores: ['akiba'], characterIds: ['akiba'], evidence: [post.text] }]
        })
      })
    ).rejects.toThrow()
    expect(
      await value.env.DB.prepare('SELECT extraction_json FROM webhook_event_jobs WHERE post_id=?')
        .bind(post.id)
        .first<string>('extraction_json')
    ).toBeNull()
    expect(
      await value.env.DB.prepare('SELECT count(*) AS total FROM webhook_event_candidates').first<number>('total')
    ).toBe(0)
    expect(await value.env.DB.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(0)
  } finally {
    await value.cleanup()
  }
})
