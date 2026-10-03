import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/route/store-select',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const StoreSelect: Story = {
  args: { source: 'workers/app/src/components/route/store-select.tsx', exportName: 'StoreSelect' },
  parameters: { catalogue: { sources: ['workers/app/src/components/route/store-select.tsx#StoreSelect'] } }
}
