import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../../ComponentExample'

const meta = {
  title: 'Components/events/comments/comment-list',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const CommentList: Story = {
  args: { source: 'workers/app/src/components/events/comments/comment-list.tsx', exportName: 'CommentList' },
  parameters: { catalogue: { sources: ['workers/app/src/components/events/comments/comment-list.tsx#CommentList'] } }
}
