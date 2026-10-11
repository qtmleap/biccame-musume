import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '@/stories/ComponentExample'

const meta = {
  title: 'Components/common/page-view-counter',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const PageViewCounter: Story = {
  args: { source: 'workers/web/src/app/components/common/page-view-counter.tsx', exportName: 'PageViewCounter' },
  parameters: {
    catalogue: { sources: ['workers/web/src/app/components/common/page-view-counter.tsx#PageViewCounter'] }
  }
}
