import { createFileRoute } from '@tanstack/react-router'
import { BotManagement } from '@/components/admin/bot-management'

export const Route = createFileRoute('/admin/bot/')({
  component: BotManagement
})
