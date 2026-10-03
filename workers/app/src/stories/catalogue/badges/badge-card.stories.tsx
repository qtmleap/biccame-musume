import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/badges/badge-card',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const BadgeCard: Story = {
  args: { source: 'workers/app/src/components/badges/badge-card.tsx', exportName: 'BadgeCard' },
  parameters: { catalogue: { sources: ['workers/app/src/components/badges/badge-card.tsx#BadgeCard'] } }
}
