import type { Meta, StoryObj } from '@storybook/react-vite'
import { EventDetectExample } from '@/stories/EventDetectExample'
import { PageExample } from '@/stories/PageExample'

const meta = {
  title: 'Pages/Local Event Detection',
  component: EventDetectExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true, access: true } }
} satisfies Meta<typeof EventDetectExample>
export default meta
type Story = StoryObj<typeof meta>
export const Statistics: Story = {
  args: { path: '/admin/event-detect/' },
  parameters: {
    catalogue: {
      sources: [
        'workers/web/src/app/routes/admin/event-detect/index.tsx#Route',
        'workers/web/src/app/components/admin/event-detect/nav.tsx#EventDetectNav'
      ]
    }
  }
}
export const Charts: Story = {
  args: { path: '/admin/event-detect/charts/' },
  parameters: {
    catalogue: {
      sources: [
        'workers/web/src/app/routes/admin/event-detect/charts/index.tsx#Route',
        'workers/web/src/app/components/admin/event-detect/charts.tsx#HistogramChart',
        'workers/web/src/app/components/admin/event-detect/charts.tsx#MonthlyChart',
        'workers/web/src/app/components/admin/event-detect/charts.tsx#StoreChart',
        'workers/web/src/app/components/ui/chart.tsx#ChartContainer',
        'workers/web/src/app/components/ui/chart.tsx#ChartTooltip',
        'workers/web/src/app/components/ui/chart.tsx#ChartLegend',
        'workers/web/src/app/components/ui/chart.tsx#ChartLegendContent',
        'workers/web/src/app/components/ui/chart.tsx#ChartStyle'
      ]
    }
  }
}
export const EmulatedEvents: Story = {
  args: { path: '/admin/event-detect/emulated/' },
  parameters: {
    catalogue: {
      sources: [
        'workers/web/src/app/routes/admin/event-detect/emulated/index.tsx#Route',
        'workers/web/src/app/components/admin/event-detect/emulated-parts.tsx#EmulatedStatusBadge'
      ]
    }
  }
}
export const EmulatedDetail: Story = {
  args: { path: '/admin/event-detect/emulated/abeno-1/' },
  parameters: {
    catalogue: {
      sources: [
        'workers/web/src/app/routes/admin/event-detect/emulated/$id/index.tsx#Route',
        'workers/web/src/app/components/admin/event-detect/emulated-parts.tsx#EmulatedVerifyBadge'
      ]
    }
  }
}
export const Events: Story = {
  args: { path: '/admin/event-detect/events/?mode=all' },
  parameters: { catalogue: { sources: ['workers/web/src/app/routes/admin/event-detect/events/index.tsx#Route'] } }
}
export const EventDetail: Story = {
  args: { path: '/admin/event-detect/events/00000000-0000-4000-8000-000000000001/' },
  parameters: { catalogue: { sources: ['workers/web/src/app/routes/admin/event-detect/events/$uuid/index.tsx#Route'] } }
}
export const Gaps: Story = {
  args: { path: '/admin/event-detect/gaps/' },
  parameters: { catalogue: { sources: ['workers/web/src/app/routes/admin/event-detect/gaps/index.tsx#Route'] } }
}
export const Keywords: Story = {
  args: { path: '/admin/event-detect/keywords/' },
  parameters: { catalogue: { sources: ['workers/web/src/app/routes/admin/event-detect/keywords/index.tsx#Route'] } }
}
export const Posts: Story = {
  args: { path: '/admin/event-detect/posts/' },
  parameters: {
    catalogue: {
      sources: [
        'workers/web/src/app/routes/admin/event-detect/posts/index.tsx#Route',
        'workers/web/src/app/components/admin/event-detect/filter-field.tsx#FilterField',
        'workers/web/src/app/components/admin/event-detect/highlight.tsx#Highlight',
        'workers/web/src/app/components/admin/event-detect/label-editor.tsx#LabelEditor',
        'workers/web/src/app/components/admin/event-detect/post-item.tsx#PostItem',
        'workers/web/src/app/components/admin/event-detect/post-item.tsx#PostList',
        'workers/web/src/app/components/admin/event-detect/segment-button.tsx#SegmentButton'
      ]
    }
  }
}
export const ProductionLayout: Story = {
  args: { path: '/admin/event-detect/' },
  render: (args) => <PageExample {...args} />,
  parameters: {
    catalogue: {
      sources: [
        'workers/web/src/app/routes/admin/event-detect.tsx#Route',
        'workers/web/src/app/components/admin/event-detect/section.tsx#EmptyState'
      ]
    }
  }
}
