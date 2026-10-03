import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/auth/social-login-buttons',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const SocialLoginButtons: Story = {
  args: { source: 'src/components/auth/social-login-buttons.tsx', exportName: 'SocialLoginButtons' },
  parameters: { catalogue: { sources: ['src/components/auth/social-login-buttons.tsx#SocialLoginButtons'] } }
}
