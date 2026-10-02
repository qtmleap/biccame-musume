import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/auth/login-button',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: false } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const LoginButton: Story = {
  args: { source: 'src/components/auth/login-button.tsx', exportName: 'LoginButton' },
  parameters: { catalogue: { sources: ['src/components/auth/login-button.tsx#LoginButton'] } }
}
