import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/events/recent-events-list',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const RecentEventsList: Story = {
  args: { source: 'src/components/events/recent-events-list.tsx', exportName: 'RecentEventsList' },
  parameters: { catalogue: { sources: ['src/components/events/recent-events-list.tsx#RecentEventsList'] } }
}
