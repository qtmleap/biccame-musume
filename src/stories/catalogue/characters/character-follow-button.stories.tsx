import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/characters/character-follow-button',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const CharacterFollowButton: Story = {
  args: { source: 'src/components/characters/character-follow-button.tsx', exportName: 'CharacterFollowButton' },
  parameters: {
    catalogue: { sources: ['src/components/characters/character-follow-button.tsx#CharacterFollowButton'] }
  }
}
