import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/home/birthday-hero-section',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const BirthdayHeroSection: Story = {
  args: { source: 'workers/app/src/components/home/birthday-hero-section.tsx', exportName: 'BirthdayHeroSection' },
  parameters: {
    catalogue: { sources: ['workers/app/src/components/home/birthday-hero-section.tsx#BirthdayHeroSection'] }
  }
}
