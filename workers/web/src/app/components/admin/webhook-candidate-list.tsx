import type { WebhookCandidate } from '@biccame/shared/schemas/webhook.dto'
import { Link } from '@tanstack/react-router'
import { Circle, CircleCheck } from 'lucide-react'
import { WebhookDiscoveryBadge } from '@/components/admin/webhook-discovery-badge'
import { webhookCandidateTitle } from '@/components/admin/webhook-labels'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const WebhookCandidateList = ({
  candidates,
  activeId,
  isPending,
  onSelect
}: {
  candidates: readonly WebhookCandidate[]
  activeId: string | undefined
  isPending: boolean
  onSelect: (id: string) => void
}) => (
  <section className='min-w-0' aria-label='識別されたイベント'>
    <h2 className='mb-1 text-lg font-semibold md:text-xl'>識別されたイベント</h2>
    <p className='mb-2 text-sm text-muted-foreground'>
      クリックで選択すると、上部の操作と下の判定結果がそのイベントに切り替わります
    </p>
    <ul className='flex flex-col gap-1.5'>
      {candidates.map((candidate) => {
        const isActive = activeId === candidate.eventUUID
        return (
          // 候補名ボタンの疑似要素で行全体を覆い、行のどこをクリックしても選択できるようにする（リンクはz-10で除外）。
          <li
            key={candidate.eventUUID}
            className={cn(
              'relative flex flex-wrap items-center justify-between gap-2 rounded-md px-2 py-1 transition-colors',
              isActive ? 'bg-brand/10 ring-1 ring-brand/40' : 'shadow-none ring-0 hover:bg-brand/5',
              isPending ? 'cursor-default' : 'cursor-pointer',
              // キーボード操作の目印は影（ring）ではなく、行から少し離したくっきりした枠線にする。
              'has-[button:focus-visible]:outline-2 has-[button:focus-visible]:outline-offset-2 has-[button:focus-visible]:outline-brand'
            )}
          >
            <Button
              variant='ghost'
              className={cn(
                'h-8 gap-2 px-0 transition-none hover:bg-transparent focus-visible:ring-0 dark:hover:bg-transparent',
                'after:absolute after:inset-0 after:rounded-md',
                isActive && 'font-semibold'
              )}
              aria-pressed={isActive}
              disabled={isPending}
              onClick={() => {
                onSelect(candidate.eventUUID)
              }}
            >
              {isActive ? <CircleCheck className='size-4' /> : <Circle className='size-4 text-muted-foreground' />}
              {webhookCandidateTitle(candidate)}
            </Button>
            <WebhookDiscoveryBadge job={candidate} />
            {candidate.eventId !== null && (
              <Link
                to='/events/$uuid'
                params={{ uuid: candidate.eventId }}
                className='relative z-10 text-sm hover:underline'
              >
                登録イベント
              </Link>
            )}
          </li>
        )
      })}
    </ul>
  </section>
)
