import { createFileRoute } from '@tanstack/react-router'
import { WebhookJobDetail } from '@/components/admin/webhook-job-detail'

const WebhookDetailPage = () => {
  const { postId } = Route.useParams()
  return <WebhookJobDetail postId={postId} />
}

export const Route = createFileRoute('/admin/webhooks/$postId/')({
  component: WebhookDetailPage
})
