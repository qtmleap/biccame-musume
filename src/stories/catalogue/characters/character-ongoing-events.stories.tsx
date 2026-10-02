import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/characters/character-ongoing-events',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const CharacterOngoingEvents: Story = {
  args: { source: 'src/components/characters/character-ongoing-events.tsx', exportName: 'CharacterOngoingEvents' },
  parameters: {
    catalogue: { sources: ['src/components/characters/character-ongoing-events.tsx#CharacterOngoingEvents'] }
  }
}
