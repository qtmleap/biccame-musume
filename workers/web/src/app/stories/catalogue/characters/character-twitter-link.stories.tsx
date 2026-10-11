import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '@/stories/ComponentExample'

const meta = {
  title: 'Components/characters/character-twitter-link',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const CharacterTwitterLink: Story = {
  args: {
    source: 'workers/web/src/app/components/characters/character-twitter-link.tsx',
    exportName: 'CharacterTwitterLink'
  },
  parameters: {
    catalogue: {
      sources: ['workers/web/src/app/components/characters/character-twitter-link.tsx#CharacterTwitterLink']
    }
  }
}
