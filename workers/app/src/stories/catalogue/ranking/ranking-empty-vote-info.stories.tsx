import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/ranking/ranking-empty-vote-info',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const RankingEmptyVoteInfo: Story = {
  args: {
    source: 'workers/app/src/components/ranking/ranking-empty-vote-info.tsx',
    exportName: 'RankingEmptyVoteInfo'
  },
  parameters: {
    catalogue: { sources: ['workers/app/src/components/ranking/ranking-empty-vote-info.tsx#RankingEmptyVoteInfo'] }
  }
}
