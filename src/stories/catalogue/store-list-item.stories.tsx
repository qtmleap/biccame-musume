import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../ComponentExample'

const meta = {
  title: 'Components/store-list-item',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const StoreListItem: Story = {
  args: { source: 'src/components/store-list-item.tsx', exportName: 'StoreListItem' },
  parameters: { catalogue: { sources: ['src/components/store-list-item.tsx#StoreListItem'] } }
}
