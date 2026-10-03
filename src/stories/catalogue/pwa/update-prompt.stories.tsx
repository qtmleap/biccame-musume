import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/pwa/update-prompt',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const UpdatePrompt: Story = {
  args: { source: 'src/components/pwa/update-prompt.tsx', exportName: 'UpdatePrompt' },
  parameters: { catalogue: { sources: ['src/components/pwa/update-prompt.tsx#UpdatePrompt'] } }
}
