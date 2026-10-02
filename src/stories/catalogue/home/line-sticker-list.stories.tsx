import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/home/line-sticker-list',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const LineStickerList: Story = {
  args: { source: 'src/components/home/line-sticker-list.tsx', exportName: 'LineStickerList' },
  parameters: { catalogue: { sources: ['src/components/home/line-sticker-list.tsx#LineStickerList'] } }
}
