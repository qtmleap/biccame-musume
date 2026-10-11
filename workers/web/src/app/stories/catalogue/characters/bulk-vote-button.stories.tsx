import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '@/stories/ComponentExample'

const meta = {
  title: 'Components/characters/bulk-vote-button',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const BulkVoteButton: Story = {
  args: { source: 'workers/web/src/app/components/characters/bulk-vote-button.tsx', exportName: 'BulkVoteButton' },
  parameters: {
    catalogue: { sources: ['workers/web/src/app/components/characters/bulk-vote-button.tsx#BulkVoteButton'] }
  }
}
