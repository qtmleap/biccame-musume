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

const extractor = (text: string) => async () => ({
  events: [{ item: '限定名刺', stores: ['akiba'], characterIds: ['akiba'], evidence: [text] }]
})

test('確度 0.85 の件数回答は、件数監査 0.9 では低確度、0.8 では一致として通る', async () => {
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
    const held = await getWebhookJob(value.env, strict.id)
    expect(held.itemCountAudit?.status).toBe('low_confidence')
    expect(held.itemCountAudit?.threshold).toBe(0.9)
    expect(held.itemCountAudit?.probability).toBe(COUNT_PROBABILITY)
    expect(held.reasons).toContain('distribution_item_count_low_confidence')
    expect(held.eventId).toBeNull()

    const relaxed = makePost('2112378276735750651', '本日から限定名刺をどなたでも配布します。')
    Object.assign(value.env, {
      EVENT_DETECTION_ITEM_COUNT_THRESHOLD: '0.8',
      EVENT_DETECTION_CHOICE_THRESHOLD: '0.95'
    })
    await insertWebhookJob(value.env, relaxed)
    await processWebhookJob(value.env, relaxed.id, { extractor: extractor(relaxed.text) })
    const passed = await getWebhookJob(value.env, relaxed.id)
    expect(passed.itemCountAudit?.status).toBe('matched')
    expect(passed.itemCountAudit?.threshold).toBe(0.8)
    expect(passed.reasons.some((reason) => reason.startsWith('distribution_item_count_'))).toBe(false)
  } finally {
    await value.cleanup()
  }
})

test('件数監査のしきい値は未設定なら 0.9 で、選択肢の共通しきい値を下げても低確度のまま', async () => {
  const value = await thresholdFixture('item-count-threshold-default')
  try {
    Object.assign(value.env, { EVENT_DETECTION_CHOICE_THRESHOLD: '0.5' })
    const post = makePost('2112378276735750652', '本日から限定名刺をどなたでも配布します。')
    await insertWebhookJob(value.env, post)
    await processWebhookJob(value.env, post.id, { extractor: extractor(post.text) })
    const job = await getWebhookJob(value.env, post.id)
    expect(job.itemCountAudit?.status).toBe('low_confidence')
    expect(job.itemCountAudit?.threshold).toBe(0.9)
    expect(job.reasons).toContain('distribution_item_count_low_confidence')
  } finally {
    await value.cleanup()
  }
})

test('再判定の件数監査も件数監査のしきい値を使い、選択肢の共通しきい値には従わない', async () => {
  const value = await thresholdFixture('item-count-threshold-rejudge')
  try {
    Object.assign(value.env, {
      EVENT_DETECTION_ITEM_COUNT_THRESHOLD: '0.9',
      EVENT_DETECTION_CHOICE_THRESHOLD: '0.7'
    })
    const post = makePost('2112378276735750653', '本日から限定名刺をどなたでも配布します。')
    await insertWebhookJob(value.env, post)
    await processWebhookJob(value.env, post.id, { extractor: extractor(post.text) })
    const first = await getWebhookJob(value.env, post.id)
    expect(first.itemCountAudit?.status).toBe('low_confidence')
    expect(first.itemCountAudit?.threshold).toBe(0.9)
    const id = first.candidates[0].eventUUID

    // 再判定は保存済み抽出を再監査する。共通しきい値は逆方向（厳しく）に動かし、件数監査だけを緩める。
    Object.assign(value.env, {
      EVENT_DETECTION_ITEM_COUNT_THRESHOLD: '0.8',
      EVENT_DETECTION_CHOICE_THRESHOLD: '0.95'
    })
    await rejudgeWebhookJob(value.env, post.id, id)
    await processWebhookJob(value.env, post.id)
    const second = await getWebhookJob(value.env, post.id)
    expect(second.itemCountAudit?.status).toBe('matched')
    expect(second.itemCountAudit?.threshold).toBe(0.8)
  } finally {
    await value.cleanup()
  }
})
