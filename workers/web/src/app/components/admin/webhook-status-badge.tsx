import { CheckCircle2, CircleAlert, CircleMinus, Clock3, Hourglass, LoaderCircle, type LucideIcon } from 'lucide-react'
import { webhookJobLabel, webhookNotificationLabel } from '@/components/admin/webhook-labels'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const JOB_ICONS: Readonly<Record<string, LucideIcon>> = {
  queued: Hourglass,
  processing: LoaderCircle,
  held: Clock3,
  registered: CheckCircle2,
  ignored: CircleMinus,
  failed: CircleAlert
}

export const WebhookStatusBadge = ({
  status,
  notification = false,
  compact = false
}: {
  status: string
  notification?: boolean
  compact?: boolean
}) => {
  const label = notification ? webhookNotificationLabel(status) : webhookJobLabel(status)
  const Icon = notification ? undefined : JOB_ICONS[status]
  const iconOnly = compact && Icon !== undefined
  // 判定状態は「登録済み」、通知状態は「通知済み」を完了として同じ濃い塗りで示す
  const done = notification ? status === 'sent' : status === 'registered'
  return (
    <Badge
      variant='outline'
      title={iconOnly ? label : undefined}
      className={cn(
        'whitespace-nowrap',
        iconOnly && 'size-6 shrink-0 justify-center p-0',
        done && 'border-status-ongoing-foreground/30 bg-status-ongoing font-semibold text-status-ongoing-foreground',
        (status === 'held' || status === 'pending' || status === 'unknown') &&
          'border-warning/40 bg-warning/10 text-foreground',
        status === 'failed' && 'border-destructive/40 bg-destructive/10 text-destructive',
        status === 'skipped' && 'border-border bg-muted/40 text-muted-foreground'
      )}
    >
      {iconOnly ? (
        <>
          <Icon className='size-3.5' aria-hidden='true' />
          <span className='sr-only'>{label}</span>
        </>
      ) : (
        <>
          {done && <CheckCircle2 className='size-3.5' aria-hidden='true' />}
          {label}
        </>
      )}
    </Badge>
  )
}
