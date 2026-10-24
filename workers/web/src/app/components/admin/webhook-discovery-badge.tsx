import type { WebhookJob } from '@biccame/shared/schemas/webhook.dto'
import { CircleHelp, CircleOff, ScanSearch } from 'lucide-react'
import { webhookDiscoveryActionLabel, webhookDiscoveryLabel } from '@/components/admin/webhook-discovery-labels'
import { webhookJobLabel } from '@/components/admin/webhook-labels'
import { WebhookStatusBadge } from '@/components/admin/webhook-status-badge'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export const WebhookDiscoveryBadge = ({
  job,
  compact = false
}: {
  job: Pick<WebhookJob, 'status' | 'discovery'>
  compact?: boolean
}) => {
  const discovery = job.discovery
  if (discovery === undefined || discovery === null) return <WebhookStatusBadge status={job.status} compact={compact} />
  const Icon =
    discovery.relevance === 'detected' ? ScanSearch : discovery.relevance === 'uncertain' ? CircleHelp : CircleOff
  const label = webhookDiscoveryLabel(discovery)
  const description = `${label} · ${webhookDiscoveryActionLabel(discovery.action)} · 登録処理：${webhookJobLabel(job.status)}`
  return (
    <Badge
      variant='outline'
      title={description}
      className={cn(
        'whitespace-nowrap border-card-border',
        compact && 'size-6 shrink-0 justify-center p-0',
        discovery.relevance === 'detected' &&
          'border-status-ongoing-foreground/30 bg-status-ongoing text-status-ongoing-foreground',
        discovery.relevance === 'uncertain' && 'border-warning/40 bg-warning/10 text-foreground',
        discovery.relevance === 'not_detected' && 'bg-muted/40 text-muted-foreground'
      )}
    >
      <Icon className='size-3.5' aria-hidden='true' />
      <span className={cn(compact && 'sr-only')}>{compact ? description : label}</span>
    </Badge>
  )
}
