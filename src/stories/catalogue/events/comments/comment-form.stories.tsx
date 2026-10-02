import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../../ComponentExample'

const meta = {
  title: 'Components/events/comments/comment-form',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const CommentForm: Story = {
  args: { source: 'src/components/events/comments/comment-form.tsx', exportName: 'CommentForm' },
  parameters: { catalogue: { sources: ['src/components/events/comments/comment-form.tsx#CommentForm'] } }
}
