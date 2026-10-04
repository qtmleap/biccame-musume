import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../ComponentExample'

const meta = {
  title: 'Components/character-list-card',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const CharacterListCard: Story = {
  args: { source: 'workers/app/src/components/character-list-card.tsx', exportName: 'CharacterListCard' },
  parameters: { catalogue: { sources: ['workers/app/src/components/character-list-card.tsx#CharacterListCard'] } }
}
