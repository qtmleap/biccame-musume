import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/common/footer',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const Footer: Story = {
  args: { source: 'src/components/common/footer.tsx', exportName: 'Footer' },
  parameters: { catalogue: { sources: ['src/components/common/footer.tsx#Footer'] } }
}
