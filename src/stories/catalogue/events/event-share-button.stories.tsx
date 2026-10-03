import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/events/event-share-button',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const EventShareButton: Story = {
  args: { source: 'src/components/events/event-share-button.tsx', exportName: 'EventShareButton' },
  parameters: { catalogue: { sources: ['src/components/events/event-share-button.tsx#EventShareButton'] } }
}
