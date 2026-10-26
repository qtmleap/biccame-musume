/** 連携先の提案から直接連携するときの確認ダイアログの文言と、押したときの実行の可否。表示から切り離した純粋な関数で、DOM なしでテストできる。 */

export const LINKED_EVENT_CONFIRM_TITLE = 'このイベントと連携しますか？'
export const LINKED_EVENT_CONFIRM_ACTION = '連携する'
/** 提案のセクションに置くボタンのラベル。 */
export const LINKED_EVENT_LINK_LABEL = 'このイベントと連携'
/** 登録済みの投稿に連携するときの追記。連携ダイアログ（webhook-event-link-dialog.tsx）の説明と同じ文言で、テストで一致を固定している。 */
export const LINKED_EVENT_REPLACING_NOTE =
  '登録済みのため、現在の連携先を置き換えます（元のイベントの内容は変更しません）。'

/** 確認ダイアログの内容。replacing は登録済みの投稿（連携先を置き換える）のとき true。 */
export const linkedEventConfirmation = (
  eventTitle: string,
  replacing: boolean
): { title: string; description: string; actionLabel: string } => ({
  title: LINKED_EVENT_CONFIRM_TITLE,
  description: `「${eventTitle}」と連携します。既存イベントの内容は変更しません。${replacing ? LINKED_EVENT_REPLACING_NOTE : ''}`,
  actionLabel: LINKED_EVENT_CONFIRM_ACTION
})

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
