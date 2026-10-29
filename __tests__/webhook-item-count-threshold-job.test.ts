import { expect, spyOn, test } from 'bun:test'
import * as discord from '@api/services/discord'
import { rejudgeWebhookJob } from '@api/services/webhook-admin'
import { getWebhookJob, insertWebhookJob } from '@api/services/webhook-jobs'
import { processWebhookJob } from '@api/services/webhook-process'
import { ClefRequestSchema } from '@biccame/shared/event-detect/clef'
import { answer, fixture, makePost, migrate } from './fixtures/webhook-multiple-events'

// 件数質問の最有力値の確度。0.9 の既定では足りず、0.8 なら足りる値にする。
const COUNT_PROBABILITY = 0.85

const thresholdFixture = async (name: string) => {
  const base = await fixture(name)
  try {
    await migrate(base.env.DB)
  } catch (error) {
    await base.cleanup()
    throw error
  }
  // Discord へは送らない。通知は常に成功した扱いにする。
  const delivery = spyOn(discord, 'notifyEventDetection').mockResolvedValue({ status: 'sent', messageId: '1234567890' })
  const env = Object.assign(base.env, {
    AI: {
      run: async (_model: string, raw: unknown) => {
        const parsed = ClefRequestSchema.safeParse(raw)
        if (!parsed.success) throw new Error('Invalid item count threshold test request')
        if (parsed.data.questions.distribution_item_count)
          return {
            answers: {
              distribution_item_count: {
                type: 'choice',
                choice: '1',
                probabilities: { '1': COUNT_PROBABILITY }
              }
            }
          }
        return answer(parsed.data)
      }
    }
  })
  const cleanup = async () => {
    delivery.mockRestore()
    await base.cleanup()
  }
  return { env, cleanup }
}

const extractor =
  (text: string, item = '限定名刺') =>
  async () => ({
    events: [{ item, stores: ['akiba'], characterIds: ['akiba'], evidence: [text] }]
  })

test('確度 0.85 の件数回答は、件数監査 0.9 では低確度、0.8 では一致と記録されるが、どちらも登録を止めない', async () => {
  const value = await thresholdFixture('item-count-threshold-direct')
  try {
    // choiceThreshold は件数監査と逆方向に動かす。連動していれば、どちらの結果も入れ替わる。
    const strict = makePost('2112378276735750650', '本日から限定名刺をどなたでも配布します。')
    Object.assign(value.env, {
      EVENT_DETECTION_ITEM_COUNT_THRESHOLD: '0.9',
      EVENT_DETECTION_CHOICE_THRESHOLD: '0.7'
    })
    await insertWebhookJob(value.env, strict)
    await processWebhookJob(value.env, strict.id, { extractor: extractor(strict.text) })
    const lowConfidence = await getWebhookJob(value.env, strict.id)
    expect(lowConfidence.itemCountAudit?.status).toBe('low_confidence')
    expect(lowConfidence.itemCountAudit?.threshold).toBe(0.9)
    expect(lowConfidence.itemCountAudit?.probability).toBe(COUNT_PROBABILITY)
    // 低確度でも関門にはしない。理由にも総括の理由にも出ず、ほかの条件が通れば登録される。
    expect(lowConfidence.reasons.some((reason) => reason.startsWith('distribution_item_count_'))).toBe(false)
    expect(lowConfidence.reasons).not.toContain('auto_registration_not_allowed')
    expect(lowConfidence.candidates[0].status).toBe('registered')
    expect(lowConfidence.candidates[0].eventId).not.toBeNull()

    const relaxed = makePost('2112378276735750651', '本日から限定名刺をどなたでも配布します。')
    Object.assign(value.env, {
      EVENT_DETECTION_ITEM_COUNT_THRESHOLD: '0.8',
      EVENT_DETECTION_CHOICE_THRESHOLD: '0.95'
    })
    await insertWebhookJob(value.env, relaxed)
    // 先に登録した同じ内容の投稿と重複扱いで保留にならないよう、別の配布物にする。
    await processWebhookJob(value.env, relaxed.id, { extractor: extractor(relaxed.text, '別の限定名刺') })
    const passed = await getWebhookJob(value.env, relaxed.id)
    expect(passed.itemCountAudit?.status).toBe('matched')
    expect(passed.itemCountAudit?.threshold).toBe(0.8)
    expect(passed.reasons.some((reason) => reason.startsWith('distribution_item_count_'))).toBe(false)
    expect(passed.candidates[0].status).toBe('registered')
    expect(passed.candidates[0].eventId).not.toBeNull()
  } finally {
    await value.cleanup()
  }
})

test('件数監査のしきい値は未設定なら 0.9 で、選択肢の共通しきい値を下げても低確度と記録される（登録は止めない）', async () => {
  const value = await thresholdFixture('item-count-threshold-default')
  try {
    Object.assign(value.env, { EVENT_DETECTION_CHOICE_THRESHOLD: '0.5' })
    const post = makePost('2112378276735750652', '本日から限定名刺をどなたでも配布します。')
    await insertWebhookJob(value.env, post)
    await processWebhookJob(value.env, post.id, { extractor: extractor(post.text) })
    const job = await getWebhookJob(value.env, post.id)
    expect(job.itemCountAudit?.status).toBe('low_confidence')
    expect(job.itemCountAudit?.threshold).toBe(0.9)
    expect(job.reasons.some((reason) => reason.startsWith('distribution_item_count_'))).toBe(false)
    expect(job.candidates[0].status).toBe('registered')
  } finally {
    await value.cleanup()
  }
})

test('再判定の件数監査も件数監査のしきい値を使い、選択肢の共通しきい値には従わない', async () => {
  const value = await thresholdFixture('item-count-threshold-rejudge')
  try {
    // 最初の判定は、回答の確率 0.99 に届かない共通しきい値で件数と無関係な理由により保留にする（登録済みの再実行は再監査しないため）。
    Object.assign(value.env, {
      EVENT_DETECTION_ITEM_COUNT_THRESHOLD: '0.9',
      EVENT_DETECTION_CHOICE_THRESHOLD: '0.995'
    })
    const post = makePost('2112378276735750653', '本日から限定名刺をどなたでも配布します。')
    await insertWebhookJob(value.env, post)
    await processWebhookJob(value.env, post.id, { extractor: extractor(post.text) })
    const first = await getWebhookJob(value.env, post.id)
    expect(first.itemCountAudit?.status).toBe('low_confidence')
    expect(first.itemCountAudit?.threshold).toBe(0.9)
    expect(first.candidates[0].status).toBe('held')
    expect(first.reasons.some((reason) => reason.startsWith('distribution_item_count_'))).toBe(false)
    const id = first.candidates[0].eventUUID

    // 再判定は保存済み抽出を再監査する。共通しきい値は 0.95（0.85 の件数回答には届かない）にして、件数監査だけを 0.8 に緩める。
    Object.assign(value.env, {
      EVENT_DETECTION_ITEM_COUNT_THRESHOLD: '0.8',
      EVENT_DETECTION_CHOICE_THRESHOLD: '0.95'
    })
    await rejudgeWebhookJob(value.env, post.id, id)
    await processWebhookJob(value.env, post.id)
    const second = await getWebhookJob(value.env, post.id)
    expect(second.itemCountAudit?.status).toBe('matched')
    expect(second.itemCountAudit?.threshold).toBe(0.8)
    expect(second.candidates[0].status).toBe('registered')
  } finally {
    await value.cleanup()
  }
})
