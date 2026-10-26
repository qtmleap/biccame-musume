import { expect, test } from 'bun:test'
import { rejudgeWebhookJob } from '@api/services/webhook-admin'
import { getWebhookJob, insertWebhookJob } from '@api/services/webhook-jobs'
import { processWebhookJob } from '@api/services/webhook-process'
import { ClefRequestSchema } from '@biccame/shared/event-detect/clef'
import { answer, fixture, makePost, migrate } from './fixtures/webhook-multiple-events'

const reviewFixture = async (name: string, choice: string, probability: number, eventProbability = 0.99) => {
  const base = await fixture(name)
  try {
    await migrate(base.env.DB)
  } catch (error) {
    await base.cleanup()
    throw error
  }
  const calls = { count: 0, candidate: 0 }
  const env = Object.assign(base.env, {
    AI: {
      run: async (_model: string, raw: unknown) => {
        const parsed = ClefRequestSchema.safeParse(raw)
        if (!parsed.success) throw new Error('Invalid review test request')
        if (parsed.data.questions.distribution_item_count) {
          calls.count += 1
          return {
            answers: {
              distribution_item_count: { type: 'choice', choice, probabilities: { [choice]: probability } }
            }
          }
        }
        // v13 の判定は 1 候補につき 1 バッチ（候補の数）。v16 の 2 段目（確認の質問だけの呼び出し）は候補に数えない。
        if (parsed.data.questions.is_event === undefined) return answer(parsed.data)
        calls.candidate += 1
        const response = answer(parsed.data)
        return {
          ...response,
          answers: {
            ...response.answers,
            ...(parsed.data.questions.is_event === undefined
              ? {}
              : { is_event: { type: 'noul' as const, noul: eventProbability } })
          }
        }
      }
    }
  })
  return { ...base, env, calls }
}

test('件数の最有力値の確度が低くても、候補を残して判定し、ほかの条件が通れば自動登録する', async () => {
  const value = await reviewFixture('item-count-low-confidence-keeps-evidence', '1', 0.82)
  try {
    const post = makePost('2112378276735750637', '本日から限定名刺をどなたでも配布します。')
    await insertWebhookJob(value.env, post)
    await processWebhookJob(value.env, post.id, {
      extractor: async () => ({
        events: [{ item: '限定名刺', stores: ['akiba'], characterIds: ['akiba'], evidence: [post.text] }]
      })
    })
    const job = await getWebhookJob(value.env, post.id)
    expect(value.calls.count).toBe(1)
    expect(value.calls.candidate).toBe(1)
    expect(job.candidates).toHaveLength(1)
    expect(job.candidates[0].answers).not.toBeNull()
    // 低確度は記録だけして、理由にも関門にもしない。
    expect(job.itemCountAudit?.status).toBe('low_confidence')
    expect(job.reasons.some((reason) => reason.startsWith('distribution_item_count_'))).toBe(false)
    expect(job.candidates[0].reasons).not.toContain('auto_registration_not_allowed')
    expect(job.candidates[0].status).toBe('registered')
    expect(await value.env.DB.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(1)
    expect(job.candidates[0].post.extractionContext?.kind).toBe('item')
  } finally {
    await value.cleanup()
  }
})

test('不一致なら再抽出を1回だけ行い、それでも不一致のとき抽出済み候補を捨てず、件数を理由にせず登録する', async () => {
  const value = await reviewFixture('item-count-mismatch-keeps-evidence', '2', 0.99)
  try {
    const post = makePost('2111747466014126157', '本日から限定名刺をどなたでも配布します。')
    const extractions: string[] = []
    await insertWebhookJob(value.env, post)
    await processWebhookJob(value.env, post.id, {
      extractor: async () => {
        extractions.push('extract')
        return { events: [{ item: '限定名刺', stores: ['akiba'], characterIds: ['akiba'], evidence: [post.text] }] }
      }
    })
    const job = await getWebhookJob(value.env, post.id)
    expect(extractions).toHaveLength(2)
    expect(job.candidates).toHaveLength(1)
    expect(value.calls.candidate).toBe(1)
    expect(job.itemCountAudit?.status).toBe('mismatch')
    expect(job.reasons.some((reason) => reason.startsWith('distribution_item_count_'))).toBe(false)
    expect(job.candidates[0].status).toBe('registered')
    expect(await value.env.DB.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(1)
  } finally {
    await value.cleanup()
  }
})

test('配布物ゼロの企画を文脈候補で確認し、展示を無理に配布物として登録しない', async () => {
  const value = await reviewFixture('zero-giveaway-retains-event-context', '0', 0.99)
  try {
    const post = makePost('2110266960051417367', 'アキバたんの展示パネルは本日で展開終了です。')
    await insertWebhookJob(value.env, post)
    await processWebhookJob(value.env, post.id, { extractor: async () => ({ events: [] }) })
    const job = await getWebhookJob(value.env, post.id)
    expect(job.candidates).toHaveLength(1)
    expect(job.candidates[0].post.extractionContext?.kind).toBe('event')
    expect(job.candidates[0].post.text).toBe(post.text)
    expect(value.calls.candidate).toBe(1)
    expect(job.eventId).toBeNull()
    expect(await value.env.DB.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(0)
  } finally {
    await value.cleanup()
  }
})

test('物品抽出がゼロなら、後段が全項目を高確度で答えても文脈候補を自動登録しない', async () => {
  const value = await reviewFixture('zero-extraction-no-auto-register', '0', 0.99)
  try {
    const post = makePost('2110266960051417369', '本日からアキバたん限定名刺をどなたでも配布します。')
    await insertWebhookJob(value.env, post)
    await processWebhookJob(value.env, post.id, { extractor: async () => ({ events: [] }) })
    const job = await getWebhookJob(value.env, post.id)
    expect(job.candidates).toHaveLength(1)
    expect(job.candidates[0].post.extractionContext?.kind).toBe('event')
    expect(job.eventId).toBeNull()
    expect(await value.env.DB.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(0)
  } finally {
    await value.cleanup()
  }
})

test('配布物ゼロの通常商品販促は確認候補があっても陽性や登録として扱わない', async () => {
  const value = await reviewFixture('zero-giveaway-unrelated-product', '0', 0.99, 0.01)
  try {
    const post = makePost('2110266960051417368', 'テレビをお買い得価格で販売中。通常の商品案内です。')
    await insertWebhookJob(value.env, post)
    await processWebhookJob(value.env, post.id, { extractor: async () => ({ events: [] }) })
    const job = await getWebhookJob(value.env, post.id)
    expect(job.candidates).toHaveLength(1)
    expect(job.status).toBe('ignored')
    expect(job.eventId).toBeNull()
    expect(await value.env.DB.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(0)
  } finally {
    await value.cleanup()
  }
})

test('再判定では物品候補へ原文参考を復元し、低確度監査でも前段停止せず、再判定後は登録に進む', async () => {
  const value = await reviewFixture('rejudge-audited-candidate-with-context', '1', 0.82)
  try {
    // 最初の判定は、回答の確率 0.99 に届かない共通しきい値で件数と無関係な理由により保留にする（登録済みの再実行は候補を作り直さないため）。
    Object.assign(value.env, { EVENT_DETECTION_CHOICE_THRESHOLD: '0.995' })
    const post = makePost('2110287829914026178', '本日から限定名刺をどなたでも配布します。')
    await insertWebhookJob(value.env, post)
    await processWebhookJob(value.env, post.id, {
      extractor: async () => ({
        events: [{ item: '限定名刺', stores: ['akiba'], characterIds: ['akiba'], evidence: [post.text] }]
      })
    })
    const first = await getWebhookJob(value.env, post.id)
    expect(first.candidates[0].status).toBe('held')
    expect(first.reasons.some((reason) => reason.startsWith('distribution_item_count_'))).toBe(false)
    const id = first.candidates[0].eventUUID
    Object.assign(value.env, { EVENT_DETECTION_CHOICE_THRESHOLD: '0.7' })
    await value.env.DB.prepare('UPDATE webhook_event_candidates SET post_json=? WHERE event_uuid=?')
      .bind(JSON.stringify(post), id)
      .run()
    await rejudgeWebhookJob(value.env, post.id, id)
    await processWebhookJob(value.env, post.id)
    const result = await getWebhookJob(value.env, post.id)
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0].eventUUID).toBe(id)
    expect(result.candidates[0].post.extractionContext?.originalText).toBe(post.text)
    expect(value.calls.count).toBe(2)
    expect(value.calls.candidate).toBe(2)
    expect(result.candidates[0].status).toBe('registered')
  } finally {
    await value.cleanup()
  }
})
