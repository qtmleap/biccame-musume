import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '@/stories/ComponentExample'

const meta = {
  title: 'Components/characters/nearby-characters-list',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const NearbyCharactersList: Story = {
  args: {
    source: 'workers/web/src/app/components/characters/nearby-characters-list.tsx',
    exportName: 'NearbyCharactersList'
  },
  parameters: {
    catalogue: {
      sources: ['workers/web/src/app/components/characters/nearby-characters-list.tsx#NearbyCharactersList']
    }
  }
}
