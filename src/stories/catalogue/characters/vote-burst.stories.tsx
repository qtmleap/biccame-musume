import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/characters/vote-burst',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const VoteBurst: Story = {
  args: { source: 'src/components/characters/vote-burst.tsx', exportName: 'VoteBurst' },
  parameters: { catalogue: { sources: ['src/components/characters/vote-burst.tsx#VoteBurst'] } }
}
