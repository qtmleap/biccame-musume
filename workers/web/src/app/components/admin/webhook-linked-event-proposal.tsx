import type { WebhookJob } from '@biccame/shared/schemas/webhook.dto'
import { Link } from '@tanstack/react-router'
import { Link2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { BotActionConfirmation } from '@/components/admin/bot-action-confirmation'
import { detectionScoreLabel } from '@/components/admin/webhook-labels'
import {
  activeLinkedEventProposal,
  isEndedPost,
  LINKED_EVENT_LINK_LABEL,
  linkedEventConfirmation,
  submitLinkedEvent
} from '@/components/admin/webhook-linked-event-confirm'
import { Button } from '@/components/ui/button'

const TITLE = '連携先の提案'

type Props = {
  /** 連携の対象。複数候補の投稿では、親ジョブではなく選択中の候補を渡す。登録済みか・終了判定かも、ここから決める。 */
  job: WebhookJob
  /** 既存の「連携」ボタンと同じ可否（webhookActionAvailability の canLink）。偽ならボタンを押せない。 */
  canLink: boolean
  /** 解決の処理中。真ならボタンと確認の実行を押せない。 */
  isPending: boolean
  /** 既存の連携ダイアログと同じ連携。選択中の候補への紐付けは呼び出し側が決める。 */
  onLink: (eventId: string) => Promise<unknown>
}

/**
 * 終了または継続と判定された投稿の連携先の提案。選択中の候補に提案が保存されていて、まだ提案のイベントへ連携していないときだけ描画し、それ以外は何も出さない。
 * 連携は、ボタンから開く確認ダイアログで「連携する」を押すまで一切行わない。
 */
export const WebhookLinkedEventProposal = ({ job, canLink, isPending, onLink }: Props) => {
  const [open, setOpen] = useState(false)
  const busy = useRef(false)
  const proposal = activeLinkedEventProposal(job)
  if (proposal === undefined) return null
  const confirmation = linkedEventConfirmation(proposal.title, {
    replacing: job.status === 'registered',
    ended: isEndedPost(job)
  })
  // 成功したら閉じる。失敗したら閉じずに、ミューテーションのトーストで知らせる（既存の確認ダイアログと同じ）。
  const confirm = async () => {
    const outcome = await submitLinkedEvent(busy, { canLink, isPending, eventId: proposal.eventId, onLink })
    if (outcome === 'linked') setOpen(false)
  }
  return (
    <section aria-label={TITLE}>
      <h2 className='mb-2 text-lg font-semibold md:text-xl'>{TITLE}</h2>
      <p className='mb-3 text-sm text-muted-foreground'>
        終了または継続を知らせる投稿の連携先候補です。自動では連携しません。
      </p>
      <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
        <Link
          to='/admin/events/$uuid/edit'
          params={{ uuid: proposal.eventId }}
          className='break-words text-brand underline underline-offset-4'
        >
          {proposal.title}
        </Link>
        <span className='text-sm text-muted-foreground'>
          確率 <span className='font-mono tabular-nums'>{detectionScoreLabel(proposal.probability)}</span>
        </span>
      </div>
      <Button
        variant='outline'
        className='mt-3 border-card-border'
        onClick={() => setOpen(true)}
        disabled={!canLink || isPending}
      >
        <Link2 className='size-4' />
        {LINKED_EVENT_LINK_LABEL}
      </Button>
      <BotActionConfirmation
        open={open}
        onOpenChange={setOpen}
        title={confirmation.title}
        description={confirmation.description}
        actionLabel={confirmation.actionLabel}
        isPending={isPending}
        actionDisabled={!canLink}
        onConfirm={confirm}
      />
    </section>
  )
}
