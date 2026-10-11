import type { Meta, StoryObj } from '@storybook/react-vite'
import { BotActionConfirmation } from '@/components/admin/bot-action-confirmation'
import { Toaster } from '@/components/ui/sonner'
import { PageExample } from '@/stories/PageExample'

const meta = {
  title: 'Pages/Admin Bot and Webhooks',
  component: PageExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true, access: true } }
} satisfies Meta<typeof PageExample>
export default meta
type Story = StoryObj<typeof meta>
export const BotSettings: Story = {
  args: { path: '/admin/bot/' },
  decorators: [
    (Story) => (
      <>
        <Story />
        <Toaster />
      </>
    )
  ],
  parameters: {
    catalogue: {
      sources: [
        'workers/web/src/app/routes/admin/bot/index.tsx#Route',
        'workers/web/src/app/components/admin/bot-management.tsx#BotManagement',
        'workers/web/src/app/components/admin/bot-settings-layout.tsx#BotSettingsLayout',
        'workers/web/src/app/components/admin/bot-settings-layout.tsx#BotSettingRow'
      ]
    }
  }
}
export const WebhookHistory: Story = {
  args: { path: '/admin/webhooks/' },
  parameters: {
    catalogue: {
      sources: [
        'workers/web/src/app/routes/admin/webhooks/index.tsx#Route',
        'workers/web/src/app/components/admin/webhook-job-list.tsx#WebhookJobList',
        'workers/web/src/app/components/admin/webhook-status-badge.tsx#WebhookStatusBadge'
      ]
    }
  }
}
export const HeldWebhook: Story = {
  args: { path: '/admin/webhooks/1000000000000000001/' },
  parameters: {
    catalogue: {
      sources: [
        'workers/web/src/app/routes/admin/webhooks/$postId/index.tsx#Route',
        'workers/web/src/app/components/admin/webhook-job-detail.tsx#WebhookJobDetail'
      ]
    }
  }
}
export const ActionConfirmation: Story = {
  args: { path: '/admin/bot/' },
  render: () => (
    <BotActionConfirmation
      open
      onOpenChange={() => {}}
      title='合成通知を再送しますか？'
      description='表示専用の確認画面です。外部サービスへの送信は発生しません。'
      actionLabel='再送'
      isPending={false}
      onConfirm={async () => {}}
    />
  ),
  parameters: {
    catalogue: { sources: ['workers/web/src/app/components/admin/bot-action-confirmation.tsx#BotActionConfirmation'] }
  }
}
export const Loading: Story = {
  args: { path: '/admin/bot/' },
  parameters: { fixture: { authenticated: true, access: true, state: 'loading' }, catalogue: { expectedLoading: true } }
}
export const RequestError: Story = {
  args: { path: '/admin/bot/' },
  parameters: { fixture: { authenticated: true, access: true, state: 'error' }, catalogue: { expectedError: true } }
}
