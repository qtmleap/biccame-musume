import type { WebhookJob } from '@biccame/shared/schemas/webhook.dto'
import { Link } from '@tanstack/react-router'
import { detectionScoreLabel } from '@/components/admin/webhook-labels'

const TITLE = '連携先の提案'

/** 終了と判定された投稿の連携先の提案。選択中の候補に提案が保存されているときだけ描画し、無ければ何も出さない。連携はしない。 */
export const WebhookLinkedEventProposal = ({ job }: { job: WebhookJob }) => {
  const proposal = job.discovery === undefined || job.discovery === null ? undefined : job.discovery.linkedEvent
  if (proposal === undefined) return null
  return (
    <section aria-label={TITLE}>
      <h2 className='mb-2 text-lg font-semibold md:text-xl'>{TITLE}</h2>
      <p className='mb-3 text-sm text-muted-foreground'>終了を知らせる投稿の連携先候補です。自動では連携しません。</p>
      <p className='flex flex-wrap items-center gap-x-3 gap-y-1'>
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
      </p>
    </section>
  )
}
