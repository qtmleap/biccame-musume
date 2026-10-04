import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/route/route-result',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const RouteResultCard: Story = {
  args: { source: 'workers/app/src/components/route/route-result.tsx', exportName: 'RouteResultCard' },
  parameters: { catalogue: { sources: ['workers/app/src/components/route/route-result.tsx#RouteResultCard'] } }
}
