import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/auth/login-dialog',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const LoginDialog: Story = {
  args: { source: 'src/components/auth/login-dialog.tsx', exportName: 'LoginDialog' },
  parameters: { catalogue: { sources: ['src/components/auth/login-dialog.tsx#LoginDialog'] } }
}
