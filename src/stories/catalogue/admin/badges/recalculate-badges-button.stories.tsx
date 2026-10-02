import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../../ComponentExample'

const meta = {
  title: 'Components/admin/badges/recalculate-badges-button',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const RecalculateBadgesButton: Story = {
  args: { source: 'src/components/admin/badges/recalculate-badges-button.tsx', exportName: 'RecalculateBadgesButton' },
  parameters: {
    catalogue: { sources: ['src/components/admin/badges/recalculate-badges-button.tsx#RecalculateBadgesButton'] }
  }
}
