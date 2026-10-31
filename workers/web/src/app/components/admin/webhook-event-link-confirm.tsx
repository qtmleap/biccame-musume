import type { WebhookLinkedEvent } from '@biccame/shared/schemas/webhook.dto'
import { useRef, useState } from 'react'
import {
  LINK_ASK_ACTION,
  LINK_ASK_CANCEL,
  LINK_ASK_FAILED,
  LINK_ASK_OTHER,
  LINK_ASK_PENDING,
  linkAskResult,
  webhookLinkAsk
} from '@/components/admin/webhook-event-link-stage'
import { submitLinkedEvent } from '@/components/admin/webhook-linked-event-confirm'
import { Button } from '@/components/ui/button'
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type Props = {
  suggestion: WebhookLinkedEvent
  /** 登録済みの連携先を付け替えるときは true。説明に、置き換える旨を足す。 */
  replacing: boolean
  /** 連携の対象にした投稿が終了判定のときは true。説明に、終了日などを書き込む旨を出す（終了判定以外は、変更しない旨）。 */
  ended: boolean
  /** 連携できる状態か(上部の「連携」ボタンの disabled の逆)。偽なら「このイベントと連携する」を押せない。 */
  canLink: boolean
  isPending: boolean
  onLink: (eventId: string) => Promise<unknown>
  onClose: () => void
  /** 「別のイベントを選ぶ」。連携はせず、検索の段階へ移る。 */
  onChooseOther: () => void
}

/**
 * 連携先の提案を「このイベントですか？」と確認する段階。DialogContent の中身だけを描く(外側は webhook-event-link-dialog.tsx)。
 * 連携は「このイベントと連携する」を押すまで一切行わない。開くだけ・「別のイベントを選ぶ」・キャンセルでは API を呼ばない。
 * 成功したら閉じ、失敗したら閉じずに文を出して押し直せる。二重送信は submitLinkedEvent が防ぐ。
 */
export const WebhookEventLinkConfirm = ({
  suggestion,
  replacing,
  ended,
  canLink,
  isPending,
  onLink,
  onClose,
  onChooseOther
}: Props) => {
  const [failed, setFailed] = useState(false)
  const busy = useRef(false)
  const ask = webhookLinkAsk(suggestion, { replacing, ended })
  const submit = async () => {
    setFailed(false)
    const outcome = await submitLinkedEvent(busy, { canLink, isPending, eventId: suggestion.eventId, onLink })
    const result = linkAskResult(outcome)
    if (result.close) onClose()
    else setFailed(result.failed)
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>{ask.title}</DialogTitle>
        <DialogDescription>
          <span className='block break-words font-medium text-foreground'>{ask.eventName}</span>
          <span className='mt-1 block'>{ask.detail}</span>
        </DialogDescription>
      </DialogHeader>
      {failed && (
        <p role='alert' className='text-sm text-destructive'>
          {LINK_ASK_FAILED}
        </p>
      )}
      <DialogFooter>
        <Button type='button' variant='outline' className='border-card-border' onClick={onClose} disabled={isPending}>
          {LINK_ASK_CANCEL}
        </Button>
        <Button
          type='button'
          variant='outline'
          className='border-card-border'
          onClick={onChooseOther}
          disabled={isPending}
        >
          {LINK_ASK_OTHER}
        </Button>
        <Button
          type='button'
          className='bg-brand text-brand-foreground hover:bg-brand/90'
          onClick={submit}
          disabled={!canLink || isPending}
        >
          {isPending ? LINK_ASK_PENDING : LINK_ASK_ACTION}
        </Button>
      </DialogFooter>
    </>
  )
}
