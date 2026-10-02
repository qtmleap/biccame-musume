import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../../ComponentExample'

const meta = {
  title: 'Components/characters/detail/store-info-items',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const InfoItem: Story = {
  args: { source: 'src/components/characters/detail/store-info-items.tsx', exportName: 'InfoItem' },
  parameters: { catalogue: { sources: ['src/components/characters/detail/store-info-items.tsx#InfoItem'] } }
}
export const StoreName: Story = {
  args: { source: 'src/components/characters/detail/store-info-items.tsx', exportName: 'StoreName' },
  parameters: { catalogue: { sources: ['src/components/characters/detail/store-info-items.tsx#StoreName'] } }
}
export const StoreAddress: Story = {
  args: { source: 'src/components/characters/detail/store-info-items.tsx', exportName: 'StoreAddress' },
  parameters: { catalogue: { sources: ['src/components/characters/detail/store-info-items.tsx#StoreAddress'] } }
}
export const StorePhone: Story = {
  args: { source: 'src/components/characters/detail/store-info-items.tsx', exportName: 'StorePhone' },
  parameters: { catalogue: { sources: ['src/components/characters/detail/store-info-items.tsx#StorePhone'] } }
}
export const StoreHours: Story = {
  args: { source: 'src/components/characters/detail/store-info-items.tsx', exportName: 'StoreHours' },
  parameters: { catalogue: { sources: ['src/components/characters/detail/store-info-items.tsx#StoreHours'] } }
}
export const StoreAccess: Story = {
  args: { source: 'src/components/characters/detail/store-info-items.tsx', exportName: 'StoreAccess' },
  parameters: { catalogue: { sources: ['src/components/characters/detail/store-info-items.tsx#StoreAccess'] } }
}
export const StoreBirthday: Story = {
  args: { source: 'src/components/characters/detail/store-info-items.tsx', exportName: 'StoreBirthday' },
  parameters: { catalogue: { sources: ['src/components/characters/detail/store-info-items.tsx#StoreBirthday'] } }
}
