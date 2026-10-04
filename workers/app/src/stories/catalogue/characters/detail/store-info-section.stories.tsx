import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../../ComponentExample'

const meta = {
  title: 'Components/characters/detail/store-info-section',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const StoreInfoSection: Story = {
  args: {
    source: 'workers/app/src/components/characters/detail/store-info-section.tsx',
    exportName: 'StoreInfoSection'
  },
  parameters: {
    catalogue: { sources: ['workers/app/src/components/characters/detail/store-info-section.tsx#StoreInfoSection'] }
  }
}
