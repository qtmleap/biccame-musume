import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/admin/event-form',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const EventForm: Story = {
  args: { source: 'src/components/admin/event-form.tsx', exportName: 'EventForm' },
  parameters: { catalogue: { sources: ['src/components/admin/event-form.tsx#EventForm'] } }
}
