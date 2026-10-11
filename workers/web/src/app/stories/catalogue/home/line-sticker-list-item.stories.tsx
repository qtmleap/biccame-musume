import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '@/stories/ComponentExample'

const meta = {
  title: 'Components/home/line-sticker-list-item',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const LineStickerListItem: Story = {
  args: { source: 'workers/web/src/app/components/home/line-sticker-list-item.tsx', exportName: 'LineStickerListItem' },
  parameters: {
    catalogue: { sources: ['workers/web/src/app/components/home/line-sticker-list-item.tsx#LineStickerListItem'] }
  }
}
