import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/characters/favorite-burst',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const FavoriteBurst: Story = {
  args: { source: 'src/components/characters/favorite-burst.tsx', exportName: 'FavoriteBurst' },
  parameters: { catalogue: { sources: ['src/components/characters/favorite-burst.tsx#FavoriteBurst'] } }
}
