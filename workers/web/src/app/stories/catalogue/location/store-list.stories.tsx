import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '@/stories/ComponentExample'

const meta = {
  title: 'Components/location/store-list',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const StoreList: Story = {
  args: { source: 'workers/web/src/app/components/location/store-list.tsx', exportName: 'StoreList' },
  parameters: { catalogue: { sources: ['workers/web/src/app/components/location/store-list.tsx#StoreList'] } }
}
