import { describe, expect, test } from 'bun:test'
import { WebhookJobStatusSchema } from '@biccame/shared/schemas/webhook.dto'
import { isValidElement } from 'react'
import { BotActionConfirmation } from '@/components/admin/bot-action-confirmation'
import {
  REJUDGE_DESCRIPTION,
  rejudgeBlockedReason,
  rejudgeConfirmation,
  webhookActionAvailability
} from '@/components/admin/webhook-labels'
import { AlertDialogCancel, AlertDialogDescription } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { baseJob, buttonState, REJUDGE_LABEL, renderDetail } from './fixtures/webhook-rejudge'

// 「再実行」は状態で無効にせず、押すと必ず確認ダイアログが開く。押せない状態は、説明に理由を出して実行ボタンを無効にする。
const JUDGING = '判定の処理中です。完了してからもう一度押してください。'
const AUTO_REGISTERED =
  '自動登録されたイベントがあるため再実行できません。内容を直すときは『編集』から、別のイベントに付け替えるときは『連携』から行ってください。'
const REJECTED = '人が対象外にした投稿のため再実行できません。'
const OTHER = 'この状態では再実行できません。'

const linked = ['manually_linked']
const auto = ['title_generated']
const rejected = ['manually_rejected']

// [表示名, status, reasons, 期待する理由（実行できる状態は null）]
const table: ReadonlyArray<readonly [string, string, readonly string[], string | null]> = [
  ['held', 'held', ['needs_review'], null],
  ['failed', 'failed', [], null],
  ['ignored（AI が対象外）', 'ignored', ['not_distribution_event'], null],
  ['registered + manually_linked（手動連携）', 'registered', linked, null],
  ['registered + 自動登録', 'registered', auto, AUTO_REGISTERED],
  ['registered + 理由なし', 'registered', [], AUTO_REGISTERED],
  ['ignored + manually_rejected（人が対象外）', 'ignored', rejected, REJECTED],
  ['failed + manually_rejected', 'failed', rejected, REJECTED],
  ['queued', 'queued', [], JUDGING],
  ['processing', 'processing', [], JUDGING],
  ['想定外の状態', 'future_state', [], OTHER]
]

describe('「再実行」を押せない理由（rejudgeBlockedReason）', () => {
  test.each(table)('%s', (_label, status, reasons, expected) => {
    expect(rejudgeBlockedReason(status, reasons)).toBe(expected)
    // canRejudge は理由が無いことと必ず一致する（規則は片方から導き、二重に書かない）。
    expect(webhookActionAvailability(status, 'sent', reasons).canRejudge).toBe(expected === null)
  })

  test('処理中の理由は、通知の状態や他の理由コードには左右されない', () => {
    for (const status of ['queued', 'processing']) {
      for (const reasons of [[], linked, rejected, auto]) expect(rejudgeBlockedReason(status, reasons)).toBe(JUDGING)
    }
  })

  test('定義済みの全ての状態で、理由は文字列か null のどちらかで、canRejudge と一致する', () => {
    for (const status of WebhookJobStatusSchema.options) {
      for (const reasons of [[], linked, auto, rejected, [...linked, ...rejected]]) {
        const reason = rejudgeBlockedReason(status, reasons)
        expect(reason === null || reason.length > 0).toBe(true)
        expect(webhookActionAvailability(status, 'pending', reasons).canRejudge).toBe(reason === null)
      }
    }
  })

  test('理由の文言は、画面の実際のボタン名（編集・連携）を指す', async () => {
    const registered = await renderDetail({
      ...baseJob,
      status: 'registered',
      reasons: auto,
      eventId: '550e8400-e29b-41d4-a716-446655440000'
    })
    // 登録済みのときの先頭ボタンは「編集」、連携のダイアログを開くボタンは「連携」。
    expect(registered).toContain('編集')
    expect(buttonState(registered, '連携')).toBe('enabled')
    expect(AUTO_REGISTERED).toContain('『編集』')
    expect(AUTO_REGISTERED).toContain('『連携』')
  })
})

describe('「再実行」の確認ダイアログの内容（rejudgeConfirmation）', () => {
  test.each(table)('%s', (_label, status, reasons, expected) => {
    const confirmation = rejudgeConfirmation(status, reasons)
    if (expected === null) {
      // 実行できる状態は、通常の説明を出し、実行ボタンを押せる。
      expect(confirmation).toEqual({ description: REJUDGE_DESCRIPTION, blocked: false })
    } else {
      // 実行できない状態は、説明に理由を出し、実行ボタンを押せなくする。
      expect(confirmation).toEqual({ description: expected, blocked: true })
    }
  })

  test('実行できる状態の説明は、回答と判定結果が消えること、自動登録と通知の可能性を伝える', () => {
    expect(REJUDGE_DESCRIPTION).toContain('保存済みの回答と判定結果を消して')
    expect(REJUDGE_DESCRIPTION).toContain('AI で最初から判定し直します')
    expect(REJUDGE_DESCRIPTION).toContain('自動登録')
    expect(REJUDGE_DESCRIPTION).toContain('通知')
  })
})

describe('「再実行」ボタンは状態で無効にしない', () => {
  test.each(table)(
    '%s でも押せる（無効になるのは通信中と、受信詳細を取得できていない間だけ）',
    async (_label, status, reasons) => {
      // 想定外の状態（定義済みの状態にない値）は、型の上で描画できないので除く。
      const known = WebhookJobStatusSchema.options.find((option) => option === status)
      if (known === undefined) return
      const markup = await renderDetail({ ...baseJob, status: known, reasons: [...reasons] })
      expect(buttonState(markup, REJUDGE_LABEL)).toBe('enabled')
    }
  )

  test('受信詳細を取得できていない間（job が無い間）だけ、無効のまま描画される', async () => {
    expect(buttonState(await renderDetail(null), REJUDGE_LABEL)).toBe('disabled')
  })

  test('画面の配線: 無効条件は job の有無と通信中だけで、押せない状態では実行ボタンを無効にし、確定処理も何もしない', async () => {
    const detail = await Bun.file('workers/web/src/app/components/admin/webhook-job-detail.tsx').text()
    expect(detail).toContain('disabled={job === undefined || isPending}')
    expect(detail).not.toContain('!availability.canRejudge')
    expect(detail).toContain("actionDisabled={confirmAction === 'rejudge' && rejudgeBlocked}")
    expect(detail).toContain("if (confirmAction === 'rejudge' && rejudgeBlocked) {")
  })
})

type Found = { type: unknown; props: Record<string, unknown> }
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
/** 要素の木（まだ描画していない）から、全ての要素を型と props つきで集める。ダイアログは Portal のため静的マークアップでは描けない。 */
const elementsOf = (node: unknown): Found[] => {
  if (Array.isArray(node)) return node.flatMap(elementsOf)
  if (!isValidElement(node)) return []
  const props = isRecord(node.props) ? node.props : {}
  return [{ type: node.type, props }, ...elementsOf(props.children)]
}

describe('確認ダイアログ（BotActionConfirmation）の actionDisabled', () => {
  const render = (extra: { isPending?: boolean; actionDisabled?: boolean }) => {
    const found = elementsOf(
      BotActionConfirmation({
        open: true,
        onOpenChange: () => {},
        title: '再実行しますか？',
        description: '説明',
        actionLabel: '実行する',
        isPending: false,
        onConfirm: async () => {},
        ...extra
      })
    )
    const action = found.find((entry) => entry.type === Button)
    const cancel = found.find((entry) => entry.type === AlertDialogCancel)
    const description = found.find((entry) => entry.type === AlertDialogDescription)
    if (action === undefined || cancel === undefined || description === undefined) throw new Error('Missing element')
    return { action, cancel, description }
  }

  test('省略したときは今までどおり、通信中でなければ実行ボタンもキャンセルも押せる', () => {
    const { action, cancel } = render({})
    expect(action.props.disabled).toBe(false)
    expect(cancel.props.disabled).toBe(false)
  })

  test('actionDisabled のときは実行ボタンだけ無効で、キャンセルは押せる。説明はそのまま出る', () => {
    const { action, cancel, description } = render({ actionDisabled: true })
    expect(action.props.disabled).toBe(true)
    expect(cancel.props.disabled).toBe(false)
    expect(description.props.children).toBe('説明')
  })

  test('通信中は、actionDisabled に関わらず両方とも無効になる（今までどおり）', () => {
    for (const actionDisabled of [false, true]) {
      const { action, cancel } = render({ isPending: true, actionDisabled })
      expect(action.props.disabled).toBe(true)
      expect(cancel.props.disabled).toBe(true)
    }
  })
})
