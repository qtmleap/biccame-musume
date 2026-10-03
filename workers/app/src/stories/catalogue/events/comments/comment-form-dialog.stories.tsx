import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../../ComponentExample'

const meta = {
  title: 'Components/events/comments/comment-form-dialog',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const CommentFormDialog: Story = {
  args: {
    source: 'workers/app/src/components/events/comments/comment-form-dialog.tsx',
    exportName: 'CommentFormDialog'
  },
  parameters: {
    catalogue: { sources: ['workers/app/src/components/events/comments/comment-form-dialog.tsx#CommentFormDialog'] }
  }
}
