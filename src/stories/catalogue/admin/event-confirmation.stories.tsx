import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/admin/event-confirmation',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const EventConfirmation: Story = {
  args: { source: 'src/components/admin/event-confirmation.tsx', exportName: 'EventConfirmation' },
  parameters: { catalogue: { sources: ['src/components/admin/event-confirmation.tsx#EventConfirmation'] } }
}
