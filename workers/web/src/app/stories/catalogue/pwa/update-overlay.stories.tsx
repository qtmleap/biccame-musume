import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '@/stories/ComponentExample'

const meta = {
  title: 'Components/pwa/update-overlay',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const UpdateOverlay: Story = {
  args: { source: 'workers/web/src/app/components/pwa/update-overlay.tsx', exportName: 'UpdateOverlay' },
  parameters: { catalogue: { sources: ['workers/web/src/app/components/pwa/update-overlay.tsx#UpdateOverlay'] } }
}
