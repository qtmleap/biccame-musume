import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/admin/access-gate',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const AccessGate: Story = {
  args: { source: 'workers/app/src/components/admin/access-gate.tsx', exportName: 'AccessGate' },
  parameters: { catalogue: { sources: ['workers/app/src/components/admin/access-gate.tsx#AccessGate'] } }
}
