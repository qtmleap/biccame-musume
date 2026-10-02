import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/auth/email-auth-tabs',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const EmailAuthTabs: Story = {
  args: { source: 'src/components/auth/email-auth-tabs.tsx', exportName: 'EmailAuthTabs' },
  parameters: { catalogue: { sources: ['src/components/auth/email-auth-tabs.tsx#EmailAuthTabs'] } }
}
