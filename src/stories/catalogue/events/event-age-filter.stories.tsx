import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { EventAgeFilter as Filter } from '@/components/events/event-age-filter'

const Example = () => {
  const [value, setValue] = useState(true)
  return <Filter value={value} onChange={setValue} />
}

const meta = {
  title: 'Components/events/event-age-filter',
  component: Example,
  tags: ['autodocs']
} satisfies Meta<typeof Example>
export default meta
type Story = StoryObj<typeof meta>
export const EventAgeFilter: Story = {
  parameters: { catalogue: { sources: ['src/components/events/event-age-filter.tsx#EventAgeFilter'] } }
}
