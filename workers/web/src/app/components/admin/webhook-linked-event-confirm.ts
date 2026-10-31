import type { WebhookJob, WebhookLinkedEvent } from '@biccame/shared/schemas/webhook.dto'

/** 連携先の提案から直接連携するときの確認ダイアログの文言と、押したときの実行の可否。表示から切り離した純粋な関数で、DOM なしでテストできる。 */

export const LINKED_EVENT_CONFIRM_TITLE = 'このイベントと連携しますか？'
export const LINKED_EVENT_CONFIRM_ACTION = '連携する'
/** 提案のセクションに置くボタンのラベル。 */
export const LINKED_EVENT_LINK_LABEL = 'このイベントと連携'
/** 登録済みの投稿に連携するときの追記。連携ダイアログ（webhook-event-link-dialog.tsx）の説明と同じ文言で、テストで一致を固定している。 */
export const LINKED_EVENT_REPLACING_NOTE =
  '登録済みのため、現在の連携先を置き換えます（元のイベントの内容は変更しません）。'

/** 連携しても既存イベントを変更しない投稿（終了判定以外）に出す説明。連携ダイアログの検索の段階にも同じ文言を使う。 */
export const LINKED_EVENT_UNCHANGED_NOTE = '既存イベントの内容は変更しません。'
/**
 * 終了判定の投稿を連携したときの説明。終了ツイートのリンクは、必ず参考URLに「終了」の種別で入れる（旧連携で告知として入っていれば終了に直す）。
 * 連携先の実際の終了日（endedAt）が未設定で、投稿日（日本時間）が開始日より前でないときだけ、投稿日を実際の終了日に書き込み、更新の投稿（X・Discord）を予約する。
 * 書き込んだときだけ予約し、未公開のイベントには予約しない。実際に送るのは、環境で投稿が有効なものだけ。
 * 参考URLの種別の表記はイベント編集フォーム（REFERENCE_URL_TYPE_LABELS）に合わせる。
 */
export const LINKED_EVENT_ENDED_NOTE =
  '終了ツイートのリンクを参考URLに「終了」として入れます。実際の終了日が未設定なら、この投稿の日付（日本時間）を書き込み、更新の投稿（X・Discord）を予約します（投稿が有効な環境でのみ送信されます）。投稿日が開始日より前のときは書き込みません。'

/** 連携の対象になる投稿が終了判定か。複数候補の投稿では、操作の対象にした候補（WebhookCandidate）を渡す。親ジョブの postStatus は使わない。 */
export const isEndedPost = (target: Pick<WebhookJob, 'postStatus'>): boolean => target.postStatus === 'end'

/** 連携前の説明が分岐する条件。replacing は登録済みの投稿（連携先を置き換える）、ended は終了判定の投稿。 */
export type LinkedEventNoteContext = { replacing: boolean; ended: boolean }

/** 連携が既存イベントに何をするかの説明。終了判定の投稿だけ内容が変わる。 */
export const linkedEventEffectNote = (ended: boolean): string =>
  ended ? LINKED_EVENT_ENDED_NOTE : LINKED_EVENT_UNCHANGED_NOTE

/** 確認ダイアログの内容。登録済みの投稿には置き換えの追記が、終了判定の投稿には終了日などを書き込む旨が付く。 */
export const linkedEventConfirmation = (
  eventTitle: string,
  { replacing, ended }: LinkedEventNoteContext
): { title: string; description: string; actionLabel: string } => ({
  title: LINKED_EVENT_CONFIRM_TITLE,
  description: `「${eventTitle}」と連携します。${linkedEventEffectNote(ended)}${replacing ? LINKED_EVENT_REPLACING_NOTE : ''}`,
  actionLabel: LINKED_EVENT_CONFIRM_ACTION
})

/**
 * 画面に出すべき連携先の提案。提案の節と、上部「連携」ボタンのダイアログの提案は、どちらもこの判定を使う。
 * 提案が無ければ undefined。すでに提案のイベントへ連携済み（eventId が同じ）でも undefined にして、同じイベントを聞き直さない。
 * 別のイベントへ連携済みなら提案は有効のままで、連携し直せる（確認には置き換えの追記が付く）。
 */
export const activeLinkedEventProposal = (
  job: Pick<WebhookJob, 'discovery' | 'eventId'>
): WebhookLinkedEvent | undefined => {
  if (job.discovery === undefined || job.discovery === null) return undefined
  const proposal = job.discovery.linkedEvent
  if (proposal === undefined) return undefined
  return job.eventId === proposal.eventId ? undefined : proposal
}

/** 連携の実行結果。skipped は条件を満たさず（または実行中で）API を呼ばなかったこと。 */
export type LinkedEventSubmitOutcome = 'linked' | 'failed' | 'skipped'

/**
 * 確認ダイアログで「連携する」を押したときの実行。連携できない状態（canLink が偽）・処理中・実行中の二重送信は、API を呼ばずに skipped を返す。
 * 失敗してもダイアログを閉じず、実行中の印を戻して改めて押せるようにする（失敗の表示はミューテーションのトーストが担う）。
 * busy は実行中の印で、React の ref をそのまま渡す。
 */
export const submitLinkedEvent = async (
  busy: { current: boolean },
  input: {
    canLink: boolean
    isPending: boolean
    eventId: string
    onLink: (eventId: string) => Promise<unknown>
  }
): Promise<LinkedEventSubmitOutcome> => {
  if (busy.current || input.isPending || !input.canLink) return 'skipped'
  busy.current = true
  try {
    await input.onLink(input.eventId)
    return 'linked'
  } catch {
    return 'failed'
  } finally {
    busy.current = false
  }
}
