import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/characters/character-competition-level',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const CharacterCompetitionLevel: Story = {
  args: {
    source: 'workers/app/src/components/characters/character-competition-level.tsx',
    exportName: 'CharacterCompetitionLevel'
  },
  parameters: {
    catalogue: {
      sources: ['workers/app/src/components/characters/character-competition-level.tsx#CharacterCompetitionLevel']
    }
  }
}
