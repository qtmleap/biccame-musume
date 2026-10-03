import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/admin/event-group-event-manager',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const EventGroupEventManager: Story = {
  args: {
    source: 'workers/app/src/components/admin/event-group-event-manager.tsx',
    exportName: 'EventGroupEventManager'
  },
  parameters: {
    catalogue: { sources: ['workers/app/src/components/admin/event-group-event-manager.tsx#EventGroupEventManager'] }
  }
}
