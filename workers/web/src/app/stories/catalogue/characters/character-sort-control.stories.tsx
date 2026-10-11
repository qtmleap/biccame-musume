import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '@/stories/ComponentExample'

const meta = {
  title: 'Components/characters/character-sort-control',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const CharacterSortControl: Story = {
  args: {
    source: 'workers/web/src/app/components/characters/character-sort-control.tsx',
    exportName: 'CharacterSortControl'
  },
  parameters: {
    catalogue: {
      sources: ['workers/web/src/app/components/characters/character-sort-control.tsx#CharacterSortControl']
    }
  }
}
