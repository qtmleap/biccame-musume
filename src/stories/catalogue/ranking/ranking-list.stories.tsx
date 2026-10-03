import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/ranking/ranking-list',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const RankingList: Story = {
  args: { source: 'src/components/ranking/ranking-list.tsx', exportName: 'RankingList' },
  parameters: { catalogue: { sources: ['src/components/ranking/ranking-list.tsx#RankingList'] } }
}
