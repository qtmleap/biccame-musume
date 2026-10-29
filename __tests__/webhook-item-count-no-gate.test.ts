import { describe, expect, spyOn, test } from 'bun:test'
import * as discord from '@api/services/discord'
import { rejudgeWebhookJob } from '@api/services/webhook-admin'
import { getWebhookJob, insertWebhookJob } from '@api/services/webhook-jobs'
import { processWebhookJob } from '@api/services/webhook-process'
import { ClefRequestSchema } from '@biccame/shared/event-detect/clef'
import type { ItemCountAudit } from '@biccame/shared/event-detect/extraction'
import { gridRootOf } from './fixtures/webhook-answer-grid'
import { listJob, renderDetail, shintouAnswers } from './fixtures/webhook-management'
import { answer, fixture, makePost, migrate } from './fixtures/webhook-multiple-events'

type CountAnswer = { choice: string; probability: number }

const reasonsOf = (reasons: readonly string[]) => ({
  item: reasons.filter((reason) => reason.startsWith('distribution_item_count_')),
  generic: reasons.filter((reason) => reason === 'auto_registration_not_allowed')
})

/** 件数の質問には指定の回答を返し、それ以外の質問は全項目を高確度で答える。通知は常に成功した扱いで、Discord へは送らない。 */
const countFixture = async (name: string, count: CountAnswer) => {
  const base = await fixture(name)
  try {
    await migrate(base.env.DB)
  } catch (error) {
    await base.cleanup()
    throw error
  }
  const delivery = spyOn(discord, 'notifyEventDetection').mockResolvedValue({ status: 'sent', messageId: '1234567890' })
  const env = Object.assign(base.env, {
    AI: {
      run: async (_model: string, raw: unknown) => {
        const parsed = ClefRequestSchema.safeParse(raw)
        if (!parsed.success) throw new Error('Invalid item count gate test request')
        if (parsed.data.questions.distribution_item_count)
          return {
            answers: {
              distribution_item_count: {
                type: 'choice',
                choice: count.choice,
                probabilities: { [count.choice]: count.probability }
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

const scenarios: readonly {
  status: ItemCountAudit['status']
  count: CountAnswer
  extractions: number
}[] = [
  { status: 'low_confidence', count: { choice: '1', probability: 0.82 }, extractions: 1 },
  // 不一致は抽出段階で1回だけ再抽出する（内部の安全策。登録の関門ではない）。
  { status: 'mismatch', count: { choice: '2', probability: 0.99 }, extractions: 2 },
  { status: 'unknown', count: { choice: 'unknown', probability: 0.99 }, extractions: 1 },
  { status: 'overflow', count: { choice: 'overflow', probability: 0.99 }, extractions: 1 }
]

for (const scenario of scenarios) {
  test(`件数の状態が ${scenario.status} でも、ほかの条件が通れば登録され、件数も総括も保留理由に付かない`, async () => {
    const value = await countFixture(`item-count-no-gate-${scenario.status}`, scenario.count)
    try {
      const post = makePost('2112378276735750700', '本日から限定名刺をどなたでも配布します。')
      const extractions: string[] = []
      await insertWebhookJob(value.env, post)
      await processWebhookJob(value.env, post.id, {
        extractor: async () => {
          extractions.push('extract')
          return { events: [{ item: '限定名刺', stores: ['akiba'], characterIds: ['akiba'], evidence: [post.text] }] }
        }
      })
      const job = await getWebhookJob(value.env, post.id)
      // 件数の監査は記録される（旧データ・キャッシュ互換のため）が、登録の可否には使わない。
      expect(job.itemCountAudit?.status).toBe(scenario.status)
      expect(extractions).toHaveLength(scenario.extractions)
      expect(job.candidates).toHaveLength(1)
      const candidate = job.candidates[0]
      expect(candidate.status).toBe('registered')
      expect(candidate.eventId).not.toBeNull()
      expect(job.status).toBe('registered')
      expect(reasonsOf(job.reasons)).toEqual({ item: [], generic: [] })
      expect(reasonsOf(candidate.reasons)).toEqual({ item: [], generic: [] })
      expect(candidate.discovery?.action).toBe('create')
      expect(candidate.discovery?.missingFields).not.toContain('itemCountAudit')
      expect(candidate.discovery?.reasons.some((reason) => reason.startsWith('distribution_item_count_'))).toBe(false)
      expect(await value.env.DB.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(1)
    } finally {
      await value.cleanup()
    }
  })
}

test('件数が不一致でも、件数と無関係な理由で保留になれば、その理由だけが残る', async () => {
  const value = await countFixture('item-count-no-gate-other-reason', { choice: '2', probability: 0.99 })
  try {
    // 共通しきい値を回答の確率 0.99 より上にして、配布物などが確定しない（件数とは無関係な）保留にする。
    Object.assign(value.env, { EVENT_DETECTION_CHOICE_THRESHOLD: '0.995' })
    const post = makePost('2112378276735750701', '本日から限定名刺をどなたでも配布します。')
    await insertWebhookJob(value.env, post)
    await processWebhookJob(value.env, post.id, {
      extractor: async () => ({
        events: [{ item: '限定名刺', stores: ['akiba'], characterIds: ['akiba'], evidence: [post.text] }]
      })
    })
    const job = await getWebhookJob(value.env, post.id)
    expect(job.itemCountAudit?.status).toBe('mismatch')
    expect(job.candidates[0].status).toBe('held')
    expect(job.candidates[0].reasons).toContain('category_unconfirmed')
    expect(reasonsOf(job.candidates[0].reasons)).toEqual({ item: [], generic: [] })
    expect(job.candidates[0].discovery?.missingFields).not.toContain('itemCountAudit')
  } finally {
    await value.cleanup()
  }
})

test('件数の理由で保留になっていた旧ジョブも、「再実行」で件数を問われず登録に進む', async () => {
  const value = await countFixture('item-count-no-gate-rejudge-old-held', { choice: '1', probability: 0.82 })
  try {
    // 最初の判定は件数と無関係な理由で保留にし、その候補を、関門があった頃に保存された形（件数の理由・総括の理由・要確認の発見記録）へ書き換える。
    Object.assign(value.env, { EVENT_DETECTION_CHOICE_THRESHOLD: '0.995' })
    const post = makePost('2112378276735750702', '本日から限定名刺をどなたでも配布します。')
    await insertWebhookJob(value.env, post)
    await processWebhookJob(value.env, post.id, {
      extractor: async () => ({
        events: [{ item: '限定名刺', stores: ['akiba'], characterIds: ['akiba'], evidence: [post.text] }]
      })
    })
    const first = await getWebhookJob(value.env, post.id)
    const id = first.candidates[0].eventUUID
    expect(first.candidates[0].status).toBe('held')
    const oldReasons = ['distribution_item_count_low_confidence', 'auto_registration_not_allowed']
    await value.env.DB.prepare(
      `UPDATE webhook_event_candidates SET reasons_json=?,
        result_json=json_set(result_json,'$.discovery.action','review','$.discovery.missingFields',json(?),'$.discovery.reasons',json(?))
        WHERE event_uuid=?`
    )
      .bind(JSON.stringify(oldReasons), JSON.stringify(['itemCountAudit']), JSON.stringify(oldReasons), id)
      .run()
    await value.env.DB.prepare('UPDATE webhook_event_jobs SET reasons_json=? WHERE post_id=?')
      .bind(JSON.stringify(['distribution_item_count_low_confidence']), post.id)
      .run()
    const old = await getWebhookJob(value.env, post.id)
    expect(old.candidates[0].reasons).toEqual(oldReasons)
    expect(old.candidates[0].discovery?.missingFields).toEqual(['itemCountAudit'])

    // 再実行は結果を消して判定し直すので、旧い発見記録（要確認）は引き継がれない。
    Object.assign(value.env, { EVENT_DETECTION_CHOICE_THRESHOLD: '0.7' })
    await rejudgeWebhookJob(value.env, post.id, id)
    await processWebhookJob(value.env, post.id)
    const result = await getWebhookJob(value.env, post.id)
    expect(result.itemCountAudit?.status).toBe('low_confidence')
    expect(result.candidates).toHaveLength(1)
    const candidate = result.candidates[0]
    expect(candidate.eventUUID).toBe(id)
    expect(candidate.status).toBe('registered')
    expect(candidate.eventId).not.toBeNull()
    expect(reasonsOf(candidate.reasons)).toEqual({ item: [], generic: [] })
    expect(candidate.discovery?.action).toBe('create')
    expect(candidate.discovery?.missingFields).not.toContain('itemCountAudit')
    expect(await value.env.DB.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(1)
  } finally {
    await value.cleanup()
  }
})

describe('詳細ページに件数の表示を出さない', () => {
  const lowConfidence: ItemCountAudit = {
    version: 'distribution-items-v2',
    expected: 1,
    probability: 0.6,
    threshold: 0.9,
    extracted: 1,
    candidates: 1,
    status: 'low_confidence'
  }

  test('保存された件数の監査（低確度・未チェックのどちらも）があっても、節・回答表のセル・注記を出さない', async () => {
    for (const audit of [lowConfidence, null, undefined]) {
      // 理由に件数のコードを入れない（ラベル「配布物の種類数と…」が部分文字列として紛れ込まないように）。
      const markup = await renderDetail(
        { ...listJob, answers: shintouAnswers, itemCountAudit: audit, reasons: ['store_unconfirmed'] },
        0.9
      )
      // 陽性対照: 回答表は描画され、ほかのセルは出ている（件数の表示だけが無いことを確かめる）。
      expect(gridRootOf(markup)).not.toBeNull()
      expect(markup).toContain('2026-10-19')
      expect(markup).toContain('data-key="category"')
      expect(markup).toContain('Clef の回答')
      expect(markup).not.toContain('投稿全体の配布物数チェック')
      expect(markup).not.toContain('配布物の種類数')
      expect(markup).not.toContain('data-key="distribution_item_count"')
      expect(markup).not.toContain('判定時に保存した値')
      expect(markup).not.toContain('件数未チェック')
      expect(markup).toContain('しきい値は現在の設定です')
    }
  })

  test('回答が無いときの表示は、件数の監査があっても「回答の記録なし」のまま', async () => {
    const markup = await renderDetail({ ...listJob, answers: {}, itemCountAudit: lowConfidence }, 0.9)
    expect(markup).toContain('回答の記録なし')
    expect(gridRootOf(markup)).toBeNull()
    expect(markup).not.toContain('配布物の種類数')
    expect(markup).not.toContain('投稿全体の配布物数チェック')
  })
})
