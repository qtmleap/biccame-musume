import { describe, expect, test } from 'bun:test'
import {
  FALLBACK_EXCEPTION_NAME,
  parseWebhookFailureCode,
  WEBHOOK_FAILURE_STAGES,
  webhookExceptionName,
  webhookFailureCode
} from '@biccame/shared/domain/webhook-failure'
import {
  isStalledWebhookJudging,
  WEBHOOK_STALLED_MINUTES,
  WEBHOOK_STALLED_MS,
  webhookStalledCutoff
} from '@biccame/shared/domain/webhook-stalled'
import { WebhookJobStatusSchema } from '@biccame/shared/schemas/webhook.dto'

const NOW = 1_792_000_000_000
const stalled = (overrides: Partial<Parameters<typeof isStalledWebhookJudging>[0]> = {}) =>
  isStalledWebhookJudging({
    status: 'queued',
    updatedAt: NOW - WEBHOOK_STALLED_MS,
    leaseUntil: null,
    now: NOW,
    ...overrides
  })

describe('止まっている処理待ち・処理中の判定（isStalledWebhookJudging）', () => {
  test('閾値は 60 分で、キューの再試行（約 31 分）を超える', () => {
    expect(WEBHOOK_STALLED_MINUTES).toBe(60)
    expect(WEBHOOK_STALLED_MS).toBe(60 * 60 * 1000)
    // 再試行の遅延 60→120→240→480→960 秒の合計。正常な待ちはこれに処理時間が加わる程度。
    const retryWindowSeconds = [60, 120, 240, 480, 960].reduce((sum, seconds) => sum + seconds, 0)
    expect(retryWindowSeconds).toBe(1860)
    expect(WEBHOOK_STALLED_MS / 1000).toBeGreaterThan(retryWindowSeconds)
  })

  test('境界: ちょうど閾値は止まっている、1ms 新しいと止まっていない、超過は止まっている', () => {
    expect(stalled({ updatedAt: NOW - WEBHOOK_STALLED_MS })).toBe(true)
    expect(stalled({ updatedAt: NOW - WEBHOOK_STALLED_MS + 1 })).toBe(false)
    expect(stalled({ updatedAt: NOW - WEBHOOK_STALLED_MS - 1 })).toBe(true)
    expect(stalled({ updatedAt: NOW - 90 * 60_000 })).toBe(true)
    expect(stalled({ updatedAt: NOW })).toBe(false)
    // 未来の更新時刻（時計のずれ）は止まっているとは見なさない。
    expect(stalled({ updatedAt: NOW + 1000 })).toBe(false)
  })

  test('上限の時刻は now から閾値を引いた値で、SQL の updated_at<=? に束縛する値と一致する', () => {
    expect(webhookStalledCutoff(NOW)).toBe(NOW - WEBHOOK_STALLED_MS)
    expect(stalled({ updatedAt: webhookStalledCutoff(NOW) })).toBe(true)
    expect(stalled({ updatedAt: webhookStalledCutoff(NOW) + 1 })).toBe(false)
  })

  test('リース: 未来なら止まっていない、過去なら止まっている、NULL なら止まっている、期限ちょうどはまだリース中', () => {
    expect(stalled({ leaseUntil: NOW + 1 })).toBe(false)
    expect(stalled({ leaseUntil: NOW + 300_000 })).toBe(false)
    expect(stalled({ leaseUntil: NOW })).toBe(false)
    expect(stalled({ leaseUntil: NOW - 1 })).toBe(true)
    expect(stalled({ leaseUntil: null })).toBe(true)
  })

  test('対象は queued と processing だけ。held などほかの状態は、古くても止まっているとは見なさない', () => {
    for (const status of WebhookJobStatusSchema.options) {
      expect(stalled({ status, updatedAt: NOW - 24 * 60 * 60_000 }), status).toBe(
        status === 'queued' || status === 'processing'
      )
    }
    expect(stalled({ status: 'held' })).toBe(false)
    expect(stalled({ status: 'future_state' })).toBe(false)
  })
})

describe('処理失敗コードの形式（processing_failed:<段階>:<例外名>）', () => {
  test('例外名はクラス名だけを残す。メッセージには触れない', () => {
    expect(webhookExceptionName(new TypeError('secret-token https://example.invalid/path'))).toBe('TypeError')
    expect(webhookExceptionName(new Error('message only'))).toBe('Error')
    class CustomFailure extends Error {
      constructor() {
        super('detail')
        this.name = 'Custom_Failure.v2$x-1'
      }
    }
    expect(webhookExceptionName(new CustomFailure())).toBe('Custom_Failure.v2$x-1')
  })

  test('形に合わない名前・Error でない値は Error にする。60 文字は残し、61 文字と空は Error', () => {
    const named = (name: string) => Object.assign(new Error('x'), { name })
    expect(webhookExceptionName(named('A'.repeat(60)))).toBe('A'.repeat(60))
    expect(webhookExceptionName(named('A'.repeat(61)))).toBe(FALLBACK_EXCEPTION_NAME)
    expect(webhookExceptionName(named(''))).toBe(FALLBACK_EXCEPTION_NAME)
    for (const name of ['has space', 'token:abc', 'a/b', 'a=b', '日本語', 'name\nline', '<script>', 'a,b']) {
      expect(webhookExceptionName(named(name)), name).toBe(FALLBACK_EXCEPTION_NAME)
    }
    // Error でない値（文字列、オブジェクト、null）は、中身が秘密を含んでいても読まない。
    for (const value of ['sk-secret-token', { name: 'TypeError', code: 'secret' }, null, undefined, 42]) {
      expect(webhookExceptionName(value)).toBe(FALLBACK_EXCEPTION_NAME)
    }
    // name を文字列でない値に差し替えた Error も読まない。
    expect(webhookExceptionName(Object.assign(new Error('x'), { name: 42 }))).toBe(FALLBACK_EXCEPTION_NAME)
  })

  test('コードは接頭辞・段階・例外名を : でつなぐ。読み戻すと段階と例外名に分かれる', () => {
    expect(webhookFailureCode('detection', 'TypeError')).toBe('processing_failed:detection:TypeError')
    for (const stage of WEBHOOK_FAILURE_STAGES) {
      const code = webhookFailureCode(stage, 'DetectionTimeoutError')
      expect(parseWebhookFailureCode(code)).toEqual({ stage, exceptionName: 'DetectionTimeoutError' })
    }
  })

  test('読み戻せない値は null（旧形式の processing_failed、抽出系の固有コード、未知の段階、不正な例外名）', () => {
    for (const value of [
      'processing_failed',
      'extraction_not_configured',
      'retry_exhausted',
      'queue_send_failed',
      'processing_failed:unknown_stage:Error',
      'processing_failed:detection:',
      `processing_failed:detection:${'A'.repeat(61)}`,
      'processing_failed:detection:has space',
      'processing_failed:detection:Error:extra'
    ]) {
      expect(parseWebhookFailureCode(value), value).toBeNull()
    }
  })
})
