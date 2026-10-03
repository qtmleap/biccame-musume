import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/common/error-boundary',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const ErrorBoundary: Story = {
  args: { source: 'src/components/common/error-boundary.tsx', exportName: 'ErrorBoundary' },
  parameters: { catalogue: { sources: ['src/components/common/error-boundary.tsx#ErrorBoundary'] } }
}

export const CaughtError: Story = {
  args: { source: 'src/components/common/error-boundary.tsx', exportName: 'ErrorBoundary', displayError: true },
  parameters: {
    catalogue: { expectedError: true, sources: ['src/components/common/error-boundary.tsx#ErrorBoundary'] }
  }
}
