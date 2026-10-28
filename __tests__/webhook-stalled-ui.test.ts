import { describe, expect, test } from 'bun:test'
import { WEBHOOK_STALLED_MS } from '@biccame/shared/domain/webhook-stalled'
import type { WebhookCandidate } from '@biccame/shared/schemas/webhook.dto'
import { WebhookJobStatusSchema } from '@biccame/shared/schemas/webhook.dto'
import dayjs from 'dayjs'
import {
  REJUDGE_DESCRIPTION,
  rejudgeBlockedReason,
  rejudgeConfirmation,
  rejudgeStalledDescription,
  webhookActionAvailability,
  webhookLastErrorLabel
} from '@/components/admin/webhook-labels'
import { baseJob, buttonState, REJUDGE_LABEL, renderDetail } from './fixtures/webhook-rejudge'

const JUDGING = '判定の処理中です。完了してからもう一度押してください。'
const NOW = Date.parse('2026-10-28T12:00:00.000Z')
const at = (offsetMs: number) => ({ updatedAt: dayjs(NOW - offsetMs).toISOString(), now: NOW })

describe('止まっている処理待ち・処理中は再実行できる（rejudgeBlockedReason / webhookActionAvailability）', () => {
  test('境界: ちょうど 60 分と超過は再実行できる。1 ミリ秒でも新しければ、従来どおり「判定の処理中です」', () => {
    for (const status of ['queued', 'processing']) {
      expect(rejudgeBlockedReason(status, [], at(WEBHOOK_STALLED_MS)), status).toBeNull()
      expect(rejudgeBlockedReason(status, [], at(WEBHOOK_STALLED_MS + 1)), status).toBeNull()
      expect(rejudgeBlockedReason(status, [], at(90 * 60_000)), status).toBeNull()
      expect(rejudgeBlockedReason(status, [], at(WEBHOOK_STALLED_MS - 1)), status).toBe(JUDGING)
      expect(rejudgeBlockedReason(status, [], at(5 * 60_000)), status).toBe(JUDGING)
      expect(webhookActionAvailability(status, 'pending', [], at(WEBHOOK_STALLED_MS)).canRejudge).toBe(true)
      expect(webhookActionAvailability(status, 'pending', [], at(WEBHOOK_STALLED_MS - 1)).canRejudge).toBe(false)
    }
  })

  test('時刻を渡さない呼び出しは、これまでどおり queued / processing を再実行できない', () => {
    for (const status of ['queued', 'processing']) {
      expect(rejudgeBlockedReason(status, [])).toBe(JUDGING)
      expect(webhookActionAvailability(status, 'pending', []).canRejudge).toBe(false)
    }
  })

  test('止まっていても、処理待ち・処理中以外の規則は変わらない（人の却下、想定外の状態、保留など）', () => {
    const old = at(3 * 60 * 60_000)
    expect(rejudgeBlockedReason('held', [], old)).toBeNull()
    expect(rejudgeBlockedReason('failed', [], old)).toBeNull()
    expect(rejudgeBlockedReason('failed', ['manually_rejected'], old)).toBe(
      '人が対象外にした投稿のため再実行できません。'
    )
    expect(rejudgeBlockedReason('ignored', ['manually_rejected'], old)).toBe(
      '人が対象外にした投稿のため再実行できません。'
    )
    expect(rejudgeBlockedReason('future_state', [], old)).toBe('この状態では再実行できません。')
  })

  test('定義済みの全ての状態で、時刻を渡しても canRejudge は理由が無いことと一致する', () => {
    for (const status of WebhookJobStatusSchema.options) {
      for (const activity of [at(0), at(WEBHOOK_STALLED_MS), undefined]) {
        const reason = rejudgeBlockedReason(status, [], activity)
        expect(webhookActionAvailability(status, 'pending', [], activity).canRejudge).toBe(reason === null)
      }
    }
  })

  test('再実行できても、連携・保留の解決・通知の再送の可否は変わらない', () => {
    expect(webhookActionAvailability('queued', 'pending', [], at(WEBHOOK_STALLED_MS))).toEqual({
      canResolve: false,
      canLink: false,
      canRejudge: true,
      canRetryNotification: false
    })
    expect(webhookActionAvailability('processing', 'pending', [], at(WEBHOOK_STALLED_MS))).toEqual({
      canResolve: false,
      canLink: false,
      canRejudge: true,
      canRetryNotification: false
    })
  })
})

describe('止まっているときの確認ダイアログの説明（rejudgeConfirmation）', () => {
  test('止まっている処理待ちは「N 分以上動いていない処理待ちをやり直します」と、通常の説明（自動登録・通知）を続ける', () => {
    const confirmation = rejudgeConfirmation('queued', [], at(90 * 60_000))
    expect(confirmation.blocked).toBe(false)
    expect(confirmation.description).toBe(`90 分以上動いていない処理待ちをやり直します。${REJUDGE_DESCRIPTION}`)
    expect(confirmation.description).toContain('結果次第でイベントが自動登録され、Discord にも通知')
  })

  test('止まっている処理中は「処理中」と書く。分数は切り捨てで、ちょうど 60 分は 60 分', () => {
    expect(rejudgeConfirmation('processing', [], at(WEBHOOK_STALLED_MS)).description).toBe(
      rejudgeStalledDescription('processing', 60)
    )
    expect(
      rejudgeConfirmation('processing', [], at(WEBHOOK_STALLED_MS)).description.startsWith(
        '60 分以上動いていない処理中を'
      )
    ).toBe(true)
    expect(rejudgeConfirmation('queued', [], at(61 * 60_000 + 59_999)).description.startsWith('61 分以上')).toBe(true)
  })

  test('止まっていない処理待ち・処理中は、従来どおり実行ボタンを押せない説明', () => {
    for (const status of ['queued', 'processing']) {
      expect(rejudgeConfirmation(status, [], at(WEBHOOK_STALLED_MS - 1))).toEqual({
        description: JUDGING,
        blocked: true
      })
      expect(rejudgeConfirmation(status, [])).toEqual({ description: JUDGING, blocked: true })
    }
  })

  test('通常の再実行（保留・失敗）に時刻を渡しても、説明は変わらない', () => {
    for (const status of ['held', 'failed']) {
      expect(rejudgeConfirmation(status, [], at(3 * 60 * 60_000))).toEqual({
        description: REJUDGE_DESCRIPTION,
        blocked: false
      })
    }
  })
})

// 今回の実例: 親ジョブは failed（processing_failed、attempts 12）、候補は queued（attempts 9、リースなし）のまま約 1.5 時間止まっている。
const candidateOf = (overrides: Partial<WebhookCandidate>): WebhookCandidate => {
  const { candidates: _candidates, ...fields } = baseJob
  return { ...fields, item: 'アクリルキーホルダー', storeKey: 'abeno', ...overrides }
}
const minutesAgo = (minutes: number) => dayjs().subtract(minutes, 'minute').toISOString()

describe('詳細画面: 選択中の候補の状態と更新時刻で再実行の可否が決まる', () => {
  test('親が failed でも、止まっている queued の候補が選ばれていれば、確認の説明は止まっている旨になる', async () => {
    const stalledCandidate = candidateOf({
      status: 'queued',
      notificationStatus: 'pending',
      attempts: 9,
      updatedAt: minutesAgo(90)
    })
    const parent = {
      ...baseJob,
      status: 'failed' as const,
      lastError: 'processing_failed:detection:TypeError',
      attempts: 12,
      candidates: [stalledCandidate]
    }
    const markup = await renderDetail(parent)
    // 「再実行」は常に押せる。確認の可否は選択中の候補（先頭）の状態で決まる。
    expect(buttonState(markup, REJUDGE_LABEL)).toBe('enabled')
    // 候補が選ばれる（候補が 1 件だけ）ので、判定状態の表示は候補の queued。親の failed ではない。
    expect(markup).toContain('処理待ち')
    // 画面と同じ規則（候補の status / updatedAt）で再実行できる。
    const activity = { updatedAt: stalledCandidate.updatedAt, now: dayjs().valueOf() }
    expect(rejudgeBlockedReason(stalledCandidate.status, stalledCandidate.reasons, activity)).toBeNull()
    expect(rejudgeConfirmation(stalledCandidate.status, stalledCandidate.reasons, activity).description).toContain(
      '分以上動いていない処理待ちをやり直します。'
    )
  })

  test('新しい queued の候補は、親が failed でも再実行できない', async () => {
    const freshCandidate = candidateOf({ status: 'queued', notificationStatus: 'pending', updatedAt: minutesAgo(5) })
    const activity = { updatedAt: freshCandidate.updatedAt, now: dayjs().valueOf() }
    expect(rejudgeBlockedReason('queued', [], activity)).toBe(JUDGING)
    const markup = await renderDetail({ ...baseJob, status: 'failed', candidates: [freshCandidate] })
    expect(buttonState(markup, REJUDGE_LABEL)).toBe('enabled')
  })

  test('処理エラーの表示: 新しい形式はコードの後ろに失敗した段階の日本語を添える。旧形式や抽出系はそのまま', async () => {
    expect(webhookLastErrorLabel('processing_failed:detection:TypeError')).toBe(
      'processing_failed:detection:TypeError（Clef の判定で失敗）'
    )
    expect(webhookLastErrorLabel('processing_failed:prompt_save:Error')).toBe(
      'processing_failed:prompt_save:Error（送信入力の保存で失敗）'
    )
    for (const value of [
      'processing_failed',
      'extraction_not_configured',
      'retry_exhausted',
      'processing_failed:other:Error'
    ]) {
      expect(webhookLastErrorLabel(value), value).toBe(value)
    }
    const markup = await renderDetail({ ...baseJob, status: 'failed', lastError: 'processing_failed:title:TypeError' })
    expect(markup).toContain('処理エラー: processing_failed:title:TypeError（タイトルの生成で失敗）')
  })

  test('画面の配線: 選択中のジョブの updatedAt と現在時刻を、可否と確認の説明の両方に渡す', async () => {
    const detail = await Bun.file('workers/web/src/app/components/admin/webhook-job-detail.tsx').text()
    expect(detail).toContain('{ updatedAt: job.updatedAt, now: dayjs().valueOf() }')
    expect(detail).toContain('webhookActionAvailability(job.status, job.notificationStatus, job.reasons, activity)')
    expect(detail).toContain('rejudgeConfirmation(job.status, job.reasons, activity)')
  })
})
