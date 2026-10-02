import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/auth/backend-session-gate',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const BackendSessionGate: Story = {
  args: { source: 'src/components/auth/backend-session-gate.tsx', exportName: 'BackendSessionGate' },
  parameters: { catalogue: { sources: ['src/components/auth/backend-session-gate.tsx#BackendSessionGate'] } }
}
