import { createFileRoute } from '@tanstack/react-router'
import { WebhookJobList } from '@/components/admin/webhook-job-list'

export const Route = createFileRoute('/admin/webhooks/')({
  component: WebhookJobList
})
