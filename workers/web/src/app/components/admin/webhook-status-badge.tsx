import { CheckCircle2 } from 'lucide-react'
import { webhookJobLabel, webhookNotificationLabel } from '@/components/admin/webhook-labels'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export const WebhookStatusBadge = ({ status, notification = false }: { status: string; notification?: boolean }) => (
  <Badge
    variant='outline'
    className={cn(
      'whitespace-nowrap',
      status === 'registered' &&
        'border-status-ongoing-foreground/30 bg-status-ongoing font-semibold text-status-ongoing-foreground',
      status === 'sent' && 'border-status-ongoing/40 bg-status-ongoing/10 text-status-ongoing-foreground',
      (status === 'held' || status === 'pending' || status === 'unknown') &&
        'border-warning/40 bg-warning/10 text-foreground',
      status === 'failed' && 'border-destructive/40 bg-destructive/10 text-destructive',
      status === 'skipped' && 'border-border bg-muted/40 text-muted-foreground'
    )}
  >
    {status === 'registered' && <CheckCircle2 className='size-3.5' aria-hidden='true' />}
    {notification ? webhookNotificationLabel(status) : webhookJobLabel(status)}
  </Badge>
)
