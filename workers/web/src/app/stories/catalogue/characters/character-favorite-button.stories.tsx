import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '@/stories/ComponentExample'

const meta = {
  title: 'Components/characters/character-favorite-button',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const CharacterFavoriteButton: Story = {
  args: {
    source: 'workers/web/src/app/components/characters/character-favorite-button.tsx',
    exportName: 'CharacterFavoriteButton'
  },
  parameters: {
    catalogue: {
      sources: ['workers/web/src/app/components/characters/character-favorite-button.tsx#CharacterFavoriteButton']
    }
  }
}
