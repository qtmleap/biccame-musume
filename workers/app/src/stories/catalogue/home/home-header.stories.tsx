import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/home/home-header',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const HomeHeader: Story = {
  args: { source: 'workers/app/src/components/home/home-header.tsx', exportName: 'HomeHeader' },
  parameters: { catalogue: { sources: ['workers/app/src/components/home/home-header.tsx#HomeHeader'] } }
}
