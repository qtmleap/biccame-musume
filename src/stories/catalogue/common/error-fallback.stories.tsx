import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/common/error-fallback',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const ErrorFallback: Story = {
  args: { source: 'src/components/common/error-fallback.tsx', exportName: 'ErrorFallback' },
  parameters: {
    catalogue: { expectedError: true, sources: ['src/components/common/error-fallback.tsx#ErrorFallback'] }
  }
}
