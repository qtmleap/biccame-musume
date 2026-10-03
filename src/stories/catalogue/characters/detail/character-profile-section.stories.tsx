import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../../ComponentExample'

const meta = {
  title: 'Components/characters/detail/character-profile-section',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const CharacterProfileSection: Story = {
  args: {
    source: 'src/components/characters/detail/character-profile-section.tsx',
    exportName: 'CharacterProfileSection'
  },
  parameters: {
    catalogue: { sources: ['src/components/characters/detail/character-profile-section.tsx#CharacterProfileSection'] }
  }
}
