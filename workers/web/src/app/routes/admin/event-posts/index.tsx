import { createFileRoute } from '@tanstack/react-router'
import { EventPostList } from '@/components/admin/event-post-list'

export const Route = createFileRoute('/admin/event-posts/')({
  component: EventPostList
})
