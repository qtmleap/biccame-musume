import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/common/not-found',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const NotFound: Story = {
  args: { source: 'src/components/common/not-found.tsx', exportName: 'NotFound' },
  parameters: { catalogue: { sources: ['src/components/common/not-found.tsx#NotFound'] } }
}
