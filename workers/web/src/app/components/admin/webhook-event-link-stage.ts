import type { WebhookLinkedEvent } from '@biccame/shared/schemas/webhook.dto'
import { detectionScoreLabel } from '@/components/admin/webhook-labels'
import {
  LINKED_EVENT_REPLACING_NOTE,
  type LinkedEventSubmitOutcome
} from '@/components/admin/webhook-linked-event-confirm'

/**
 * 上部の「連携」ボタンで開くダイアログの段階と、確認の段階の文言。表示から切り離した純粋な関数で、DOM なしでテストできる。
 * 連携先の提案があるときは、最初に「このイベントですか？」と確認し、「別のイベントを選ぶ」で検索の段階へ移る。提案がなければ検索の段階から始まる。
 * 段階は開くたびに提案から決め直す（ダイアログの中身は閉じるたびに作り直される）。検索の段階は提案を受け取らないので、必ず選択なしで始まる。
 */
export type WebhookLinkStage = 'confirm' | 'search'
export type WebhookLinkStageAction = { type: 'choose_other' }

/** 開いた直後の段階。提案があれば確認、なければ検索。 */
export const initialWebhookLinkStage = (suggestion: WebhookLinkedEvent | undefined): WebhookLinkStage =>
  suggestion === undefined ? 'search' : 'confirm'

/** 段階の遷移。「別のイベントを選ぶ」で検索へ移る（検索の段階のままなら変わらない）。 */
export const reduceWebhookLinkStage = (stage: WebhookLinkStage, action: WebhookLinkStageAction): WebhookLinkStage =>
  action.type === 'choose_other' ? 'search' : stage

export const LINK_ASK_TITLE = 'このイベントですか？'
export const LINK_ASK_ACTION = 'このイベントと連携する'
export const LINK_ASK_OTHER = '別のイベントを選ぶ'
export const LINK_ASK_CANCEL = 'キャンセル'
export const LINK_ASK_PENDING = '連携中…'
/** 連携に失敗したときに確認の段階へ出す文。検索の段階（webhook-event-link-dialog.tsx）と同じ文言で、テストで一致を固定している。 */
export const LINK_ASK_FAILED = '連携に失敗しました。内容を確認して再試行してください。'

/**
 * 確認の段階の内容。eventName は提案イベントのタイトル（「」付き）、detail は確率と、既存イベントを変更しない旨。
 * replacing は登録済みの投稿（連携先を置き換える）のとき true で、既存の連携ダイアログと同じ置き換えの文言を続ける。確率の表記は detectionScoreLabel と同じ。
 */
export const webhookLinkAsk = (
  suggestion: WebhookLinkedEvent,
  replacing: boolean
): { title: string; eventName: string; detail: string } => ({
  title: LINK_ASK_TITLE,
  eventName: `「${suggestion.title}」`,
  detail: `確率 ${detectionScoreLabel(suggestion.probability)}。既存イベントの内容は変更しません。${replacing ? LINKED_EVENT_REPLACING_NOTE : ''}`
})

/**
 * 「このイベントと連携する」を押した結果の扱い。成功したときだけ閉じる。失敗したら閉じずに失敗の文を出して押し直せる。
 * 条件を満たさず(または実行中で)API を呼ばなかった場合(skipped)は、閉じもせず、失敗の文も出さない。
 */
export const linkAskResult = (outcome: LinkedEventSubmitOutcome): { close: boolean; failed: boolean } => ({
  close: outcome === 'linked',
  failed: outcome === 'failed'
})
