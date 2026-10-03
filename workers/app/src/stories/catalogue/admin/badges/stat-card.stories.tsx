import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../../ComponentExample'

const meta = {
  title: 'Components/admin/badges/stat-card',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const StatCard: Story = {
  args: { source: 'workers/app/src/components/admin/badges/stat-card.tsx', exportName: 'StatCard' },
  parameters: { catalogue: { sources: ['workers/app/src/components/admin/badges/stat-card.tsx#StatCard'] } }
}
