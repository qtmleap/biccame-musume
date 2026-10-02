import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../../ComponentExample'

const meta = {
  title: 'Components/admin/badges/create-badge-dialog',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const CreateBadgeDialog: Story = {
  args: { source: 'src/components/admin/badges/create-badge-dialog.tsx', exportName: 'CreateBadgeDialog' },
  parameters: { catalogue: { sources: ['src/components/admin/badges/create-badge-dialog.tsx#CreateBadgeDialog'] } }
}
