import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/route/selected-store-list',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const SelectedStoreList: Story = {
  args: { source: 'workers/app/src/components/route/selected-store-list.tsx', exportName: 'SelectedStoreList' },
  parameters: { catalogue: { sources: ['workers/app/src/components/route/selected-store-list.tsx#SelectedStoreList'] } }
}
