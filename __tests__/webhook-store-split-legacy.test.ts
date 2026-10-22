import { expect, spyOn, test } from 'bun:test'
import * as discord from '@api/services/discord'
import { rejudgeWebhookJob } from '@api/services/webhook-admin'
import { getWebhookJob, insertWebhookJob } from '@api/services/webhook-jobs'
import { processWebhookJob } from '@api/services/webhook-process'
import { DETECTION_VERSION } from '@biccame/shared/event-detect/detection'
import { EXTRACTION_VERSION } from '@biccame/shared/event-detect/extraction'
import { fixture, makePost, migrate } from './fixtures/webhook-multiple-events'

// 質問の版 v3〜v12 は、店舗とビッカメ娘を venue.* / character.*（noul）で尋ねた。保存済みの回答はこの形のまま読める。
const v12Answers = {
  is_event: { type: 'noul', noul: 0.97 },
  status: { type: 'choice', choice: 'start', probabilities: { start: 0.97, announce: 0.03 } },
  category: { type: 'choice', choice: 'limited_card', probabilities: { limited_card: 0.97, none: 0.03 } },
  start_date: { type: 'choice', choice: 'd20261011', probabilities: { d20261011: 0.97, none: 0.03 } },
  'venue.akiba': { type: 'noul', noul: 0.97 },
  'venue.abeno': { type: 'noul', noul: 0.96 },
  'venue.nanba': { type: 'noul', noul: 0.02 },
  'character.akiba': { type: 'noul', noul: 0.97 },
  'character.abeno': { type: 'noul', noul: 0.01 }
}

/** v12 以前の形で保存した、複数店舗の抽出イベント 1 件を 1 行にした保留の候補（store_key は無い）を作る。 */
const seedV12 = async (env: Awaited<ReturnType<typeof fixture>>['env'], id: string) => {
  const text = '本日からあきばとあべので限定名刺をどなたでも配布します。'
  const post = makePost(id, text)
  await insertWebhookJob(env, post)
  const uuid = crypto.randomUUID()
  const extraction = {
    version: 'giveaways-v6-focused-review',
    contextVersion: EXTRACTION_VERSION,
    events: [{ item: '合同限定名刺', stores: ['akiba', 'abeno'], characterIds: ['akiba'], evidence: [text] }],
    itemCountAudit: {
      version: 'distribution-items-v2',
      expected: 1,
      probability: 0.99,
      threshold: 0.9,
      extracted: 1,
      candidates: 1,
      status: 'matched'
    }
  }
  const result = { status: 'held', confidence: 0.97, reasons: ['store_unconfirmed'] }
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE webhook_event_jobs SET extraction_json=?,status='held',notification_status='sent' WHERE post_id=?"
    ).bind(JSON.stringify(extraction), post.id),
    env.DB.prepare(`INSERT INTO webhook_event_candidates
      (event_uuid,post_id,item,post_json,source_url,status,reasons_json,result_json,answers_json,question_version,confidence,notification_status,created_at,updated_at)
      VALUES (?,?,?,?,?,'held',?,?,?,'v5-webhook-v12-neutral-context',0.97,'sent',1,1)`).bind(
      uuid,
      post.id,
      '合同限定名刺',
      JSON.stringify(post),
      post.url,
      JSON.stringify(result.reasons),
      JSON.stringify(result),
      JSON.stringify(v12Answers)
    )
  ])
  return { post, uuid, text }
}

test('v12 以前に保存した候補（venue.* / character.* の回答・store_key 無し）を壊さず読み、下書きも従来どおり作る', async () => {
  const { cleanup, env } = await fixture('store-split-legacy-read')
  try {
    await migrate(env.DB)
    const { post, uuid } = await seedV12(env, '2112378276735750711')
    const job = await getWebhookJob(env, post.id)
    expect(job.candidates).toHaveLength(1)
    const [candidate] = job.candidates
    expect(candidate.eventUUID).toBe(uuid)
    expect(candidate.storeKey).toBeNull()
    expect(candidate.questionVersion).toBe('v5-webhook-v12-neutral-context')
    expect(Object.keys(candidate.answers === null ? {} : candidate.answers)).toContain('venue.akiba')
    // 旧形式の下書きは、しきい値以上の venue.* と character.* から取る（akiba と abeno の 2 店舗、娘は akiba）。
    expect(candidate.draft?.stores.slice().sort()).toEqual(['abeno', 'akiba'])
    expect(candidate.draft?.characterIds).toEqual(['akiba'])
    expect(job.itemCountAudit).toMatchObject({ extracted: 1, candidates: 1, status: 'matched' })
  } finally {
    await cleanup()
  }
}, 60000)

test('複数店舗を 1 行に保存した旧候補の再判定は、分割し直さず UUID を保ち、店舗の絞り込み無しで現行の質問に答え直す', async () => {
  const { cleanup, env, calls } = await fixture('store-split-legacy-rejudge')
  const delivery = spyOn(discord, 'notifyEventDetection').mockResolvedValue({ status: 'sent', messageId: '1234567890' })
  try {
    await migrate(env.DB)
    const { post, uuid, text } = await seedV12(env, '2112378276735750712')
    await rejudgeWebhookJob(env, post.id, uuid)
    await processWebhookJob(env, post.id, {
      extractor: async () => {
        throw new Error('Must not extract again')
      }
    })
    const job = await getWebhookJob(env, post.id)
    // 候補は 1 行のまま（店舗ごとに増やさない）。再判定は店舗の絞り込み（storeKey）無しで行う。
    expect(job.candidates).toHaveLength(1)
    const [candidate] = job.candidates
    expect(candidate.eventUUID).toBe(uuid)
    expect(candidate.storeKey).toBeNull()
    expect(calls).toHaveLength(1)
    expect(calls[0]).not.toContain('抽出段階の開催店舗候補')
    // item だけで一意に決まるので、原文参考は復元される。
    expect(candidate.post.extractionContext?.kind).toBe('item')
    expect(candidate.post.text).toBe(text)
    // 回答は現行の質問（store と character の choice）になり、版が現行になる。
    expect(candidate.questionVersion).toBe(DETECTION_VERSION)
    expect(candidate.answers?.store.type).toBe('choice')
    expect(candidate.answers?.character.type).toBe('choice')
    expect(
      Object.keys(candidate.answers === null ? {} : candidate.answers).some((key) => key.startsWith('venue.'))
    ).toBe(false)
  } finally {
    delivery.mockRestore()
    await cleanup()
  }
}, 60000)
