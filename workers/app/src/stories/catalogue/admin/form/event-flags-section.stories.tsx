import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../../ComponentExample'

const meta = {
  title: 'Components/admin/form/event-flags-section',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const EventFlagsSection: Story = {
  args: { source: 'workers/app/src/components/admin/form/event-flags-section.tsx', exportName: 'EventFlagsSection' },
  parameters: {
    catalogue: { sources: ['workers/app/src/components/admin/form/event-flags-section.tsx#EventFlagsSection'] }
  }
}
