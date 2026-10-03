import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/admin/event-list',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const EventList: Story = {
  args: { source: 'src/components/admin/event-list.tsx', exportName: 'EventList' },
  parameters: { catalogue: { sources: ['src/components/admin/event-list.tsx#EventList'] } }
}
