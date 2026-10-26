import { describe, expect, test } from 'bun:test'
import { rejudgeWebhookJob } from '@api/services/webhook-admin'
import { processWebhookJob } from '@api/services/webhook-process'
import {
  databaseSnapshot,
  expectConfiguration,
  getWebhookJob,
  judgeSingle,
  REJUDGED_PROBABILITY,
  rejudgeHarness,
  rowOf,
  saveEventThresholds,
  saveFieldThresholds,
  storedResult
} from './fixtures/webhook-rejudge-registered'

const postIdOf = (index: number) => `210922172177359${String(index).padStart(4, '0')}`

// 自動登録済みの再実行は、実行のたびに現在の設定（KV のモデル・3 つのしきい値・項目別しきい値）を読み、
// その設定で判定し直した結果で保存済みの判定結果（result_json）を上書きする。
// 同じ回答を返す AI に対して設定だけを変えて再実行し、判定結果が設定に追従することを見る（保存済みの値との比較だけでは足りない）。
describe('自動登録済みの再実行は、現在のしきい値で判定結果を上書きする', () => {
  test('項目別の状態（status）のしきい値: 同じ回答でも、設定を変えて再実行すると判定が変わり、戻すと元に戻る', async () => {
    const { env, cleanup, ai, notifications, sent } = await rejudgeHarness('rejudge-thresholds-status')
    try {
      const post = await judgeSingle(env, postIdOf(1))
      const before = await getWebhookJob(env, post.id)
      const candidateId = before.candidates[0].eventUUID
      const databaseBefore = await databaseSnapshot(env)
      const notified = notifications.length
      // 状態は 0.85 で答える。既定の下限（0.8）以上なので登録、保存値 0.95 では未確定で保留になる。
      ai.state.armed = true
      ai.state.probabilities = { status: 0.85 }
      const rejudge = async () => {
        await rejudgeWebhookJob(env, post.id)
        return rowOf(env, 'webhook_event_candidates', 'event_uuid', candidateId)
      }
      await expectConfiguration(env, { fieldThresholds: { status: 0.8 } })
      const defaults = await rejudge()
      expect(storedResult(defaults)).toMatchObject({ status: 'register', reasons: [] })
      await saveFieldThresholds(env, { status: 0.95 })
      await expectConfiguration(env, { fieldThresholds: { status: 0.95 } })
      const strict = await rejudge()
      expect(storedResult(strict)).toMatchObject({ status: 'held' })
      expect(storedResult(strict).reasons).toContain('status_unconfirmed')
      expect(storedResult(strict).discovery.reasons).toContain('status_unconfirmed')
      // 同じ回答（AI の返答は同じ）で、判定結果だけが設定に追従して変わる。
      expect(strict.answers_json).toBe(defaults.answers_json)
      expect(strict.result_json).not.toBe(defaults.result_json)
      await saveFieldThresholds(env, { status: 0.8 })
      await expectConfiguration(env, { fieldThresholds: { status: 0.8 } })
      const restored = await rejudge()
      expect(restored.result_json).toBe(defaults.result_json)
      // どの設定でも登録済みのまま。イベント・通知・キューは動かない。
      expect(await getWebhookJob(env, post.id)).toMatchObject({ status: 'registered' })
      expect(await databaseSnapshot(env)).toEqual(databaseBefore)
      expect(notifications).toHaveLength(notified)
      expect(sent).toEqual([])
    } finally {
      await cleanup()
    }
  }, 60000)

  test('店舗（store）のしきい値 70% → 95%: 95% にすると確認の質問を聞き、確認が低ければ保留、70% に戻すと確認なしで登録', async () => {
    const { env, cleanup, ai, sent } = await rejudgeHarness('rejudge-thresholds-store')
    try {
      const post = await judgeSingle(env, postIdOf(2))
      const candidateId = (await getWebhookJob(env, post.id)).candidates[0].eventUUID
      // 店舗は 0.8 で答え、確認の「はい」は 0.3。0.8 は既定の 0.7 以上なので確認なしで確定する。
      ai.state.armed = true
      ai.state.probabilities = { store: 0.8, store_confirm: 0.3 }
      const confirmAsked = () => ai.state.calls.filter((call) => call.questions.store_confirm !== undefined).length
      const rejudge = async () => {
        await rejudgeWebhookJob(env, post.id)
        return rowOf(env, 'webhook_event_candidates', 'event_uuid', candidateId)
      }
      await expectConfiguration(env, { fieldThresholds: { store: 0.7, store_confirm: 0.7 } })
      const defaults = await rejudge()
      expect(storedResult(defaults)).toMatchObject({ status: 'register' })
      expect(confirmAsked()).toBe(0)
      await saveFieldThresholds(env, { store: 0.95 })
      await expectConfiguration(env, { fieldThresholds: { store: 0.95, store_confirm: 0.7 } })
      const strict = await rejudge()
      // 0.8 は 0.95 未満なので確認を聞き、確認の「はい」0.3 は下限 0.7 未満なので店舗を確定しない。
      expect(confirmAsked()).toBe(1)
      expect(storedResult(strict)).toMatchObject({ status: 'held' })
      expect(storedResult(strict).reasons).toContain('store_confirm_low')
      expect(JSON.parse(String(strict.answers_json)).store_confirm).toEqual({ type: 'noul', noul: 0.3 })
      expect(strict.result_json).not.toBe(defaults.result_json)
      await saveFieldThresholds(env, { store: 0.7 })
      await expectConfiguration(env, { fieldThresholds: { store: 0.7 } })
      const restored = await rejudge()
      expect(restored.result_json).toBe(defaults.result_json)
      expect(confirmAsked()).toBe(1)
      expect(await getWebhookJob(env, post.id)).toMatchObject({ status: 'registered' })
      expect(sent).toEqual([])
    } finally {
      await cleanup()
    }
  }, 60000)

  test('3 つのしきい値: 共通の選択のしきい値（choiceThreshold）は項目別の既定に効き、登録のしきい値（eventThreshold）は発見記録に効く', async () => {
    const { env, cleanup, ai } = await rejudgeHarness('rejudge-thresholds-event')
    try {
      const post = await judgeSingle(env, postIdOf(3))
      const candidateId = (await getWebhookJob(env, post.id)).candidates[0].eventUUID
      ai.state.armed = true
      const rejudge = async () => {
        await rejudgeWebhookJob(env, post.id)
        return storedResult(await rowOf(env, 'webhook_event_candidates', 'event_uuid', candidateId))
      }
      // 全項目 0.99 で答える。既定の選択のしきい値 0.9 では確定して登録の判定。
      await saveEventThresholds(env, { eventThreshold: 0.9, ignoreThreshold: 0.5, choiceThreshold: 0.9 })
      await expectConfiguration(env, { eventThreshold: 0.9, ignoreThreshold: 0.5, choiceThreshold: 0.9 })
      expect(await rejudge()).toMatchObject({ status: 'register' })
      // 選択のしきい値を 0.995 にすると、0.99 の回答は確定せず保留になる（項目別の既定が追従する）。
      await saveEventThresholds(env, { eventThreshold: 0.9, ignoreThreshold: 0.5, choiceThreshold: 0.995 })
      await expectConfiguration(env, { choiceThreshold: 0.995, fieldThresholds: { category: 0.995 } })
      const strict = await rejudge()
      expect(strict.status).toBe('held')
      expect(strict.reasons).toContain('category_unconfirmed')
      // 登録のしきい値は is_event の参考値。0.8123 は 0.9 未満なので判定未確定、0.8 に下げると検出済みになる。
      ai.state.probabilities = { status: 0.5 }
      await saveEventThresholds(env, { eventThreshold: 0.9, ignoreThreshold: 0.5, choiceThreshold: 0.9 })
      const uncertain = await rejudge()
      expect(uncertain).toMatchObject({ status: 'held', confidence: REJUDGED_PROBABILITY })
      expect(uncertain.discovery.relevance).toBe('uncertain')
      await saveEventThresholds(env, { eventThreshold: 0.8, ignoreThreshold: 0.5, choiceThreshold: 0.9 })
      await expectConfiguration(env, { eventThreshold: 0.8 })
      const detected = await rejudge()
      expect(detected.discovery.relevance).toBe('detected')
      expect(detected.discovery.evidence).toContain('model_event_confirmed')
      expect(await getWebhookJob(env, post.id)).toMatchObject({ status: 'registered' })
    } finally {
      await cleanup()
    }
  }, 60000)
})

// 従来の経路（queued に戻して processWebhookJob が判定し直す）も、実行のたびに現在の設定を読み、古い判定結果を残さない。
describe('従来の再実行（queued に戻す経路）も、現在のしきい値で判定し直す', () => {
  test('保留を再実行すると保存済みの判定結果が消え、処理が現在の設定で判定した結果が保存される', async () => {
    const { env, cleanup, ai } = await rejudgeHarness('rejudge-thresholds-queue')
    try {
      // 状態のしきい値を 1.0 にして保留にする（全項目 0.99 で答えるので、状態が未確定になる）。
      await saveFieldThresholds(env, { status: 1 })
      await expectConfiguration(env, { fieldThresholds: { status: 1 } })
      const post = await judgeSingle(env, postIdOf(4))
      const held = (await getWebhookJob(env, post.id)).candidates[0]
      expect(held.status).toBe('held')
      const heldRow = await rowOf(env, 'webhook_event_candidates', 'event_uuid', held.eventUUID)
      expect(storedResult(heldRow)).toMatchObject({ status: 'held' })
      expect(storedResult(heldRow).reasons).toContain('status_unconfirmed')
      // 設定を既定に戻して再実行する。保存済みの古い判定結果（保留）はその場で消え、残らない。
      await saveFieldThresholds(env, { status: 0.8 })
      await expectConfiguration(env, { fieldThresholds: { status: 0.8 } })
      ai.state.armed = true
      await rejudgeWebhookJob(env, post.id, held.eventUUID)
      expect(await rowOf(env, 'webhook_event_candidates', 'event_uuid', held.eventUUID)).toMatchObject({
        status: 'queued',
        result_json: null,
        answers_json: null
      })
      await processWebhookJob(env, post.id)
      const after = await rowOf(env, 'webhook_event_candidates', 'event_uuid', held.eventUUID)
      // 処理が読んだ現在の設定で判定し直した結果になる（古い保留の結果ではない）。
      expect(storedResult(after)).toMatchObject({ status: 'register', reasons: [] })
      expect(after.result_json).not.toBe(heldRow.result_json)
      expect(after).toMatchObject({ status: 'registered' })
      expect(ai.state.calls.length).toBeGreaterThan(0)
    } finally {
      await cleanup()
    }
  }, 60000)

  test('厳しい設定に変えて再実行すると、前回の登録の結果ではなく、現在の設定の結果（保留）が残る', async () => {
    const { env, cleanup, ai } = await rejudgeHarness('rejudge-thresholds-queue-strict')
    try {
      const post = await judgeSingle(env, postIdOf(5))
      const candidate = (await getWebhookJob(env, post.id)).candidates[0]
      // 保留にして手動連携に近い状態（再実行で queued に戻れる）にするため、状態を保留に戻してから再実行する。
      await env.DB.prepare("UPDATE webhook_event_candidates SET status='held',event_id=NULL WHERE event_uuid=?")
        .bind(candidate.eventUUID)
        .run()
      await env.DB.prepare("UPDATE webhook_event_jobs SET status='held',event_id=NULL WHERE post_id=?")
        .bind(post.id)
        .run()
      await saveFieldThresholds(env, { status: 1 })
      await expectConfiguration(env, { fieldThresholds: { status: 1 } })
      ai.state.armed = true
      await rejudgeWebhookJob(env, post.id, candidate.eventUUID)
      await processWebhookJob(env, post.id)
      const after = await rowOf(env, 'webhook_event_candidates', 'event_uuid', candidate.eventUUID)
      expect(storedResult(after)).toMatchObject({ status: 'held' })
      expect(storedResult(after).reasons).toContain('status_unconfirmed')
      expect(after.status).toBe('held')
    } finally {
      await cleanup()
    }
  }, 60000)
})
