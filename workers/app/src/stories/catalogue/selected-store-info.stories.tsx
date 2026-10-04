import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../ComponentExample'

const meta = {
  title: 'Components/selected-store-info',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const SelectedStoreInfo: Story = {
  args: { source: 'workers/app/src/components/selected-store-info.tsx', exportName: 'SelectedStoreInfo' },
  parameters: { catalogue: { sources: ['workers/app/src/components/selected-store-info.tsx#SelectedStoreInfo'] } }
}
