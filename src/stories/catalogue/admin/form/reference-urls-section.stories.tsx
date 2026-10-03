import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../../ComponentExample'

const meta = {
  title: 'Components/admin/form/reference-urls-section',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const ReferenceUrlsSection: Story = {
  args: { source: 'src/components/admin/form/reference-urls-section.tsx', exportName: 'ReferenceUrlsSection' },
  parameters: { catalogue: { sources: ['src/components/admin/form/reference-urls-section.tsx#ReferenceUrlsSection'] } }
}
