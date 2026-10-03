import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/ranking/ranking-row',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const RankingRow: Story = {
  args: { source: 'workers/app/src/components/ranking/ranking-row.tsx', exportName: 'RankingRow' },
  parameters: { catalogue: { sources: ['workers/app/src/components/ranking/ranking-row.tsx#RankingRow'] } }
}
