import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/common/loading-fallback',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const LoadingFallback: Story = {
  args: { source: 'src/components/common/loading-fallback.tsx', exportName: 'LoadingFallback' },
  parameters: {
    catalogue: { expectedLoading: true, sources: ['src/components/common/loading-fallback.tsx#LoadingFallback'] }
  }
}
