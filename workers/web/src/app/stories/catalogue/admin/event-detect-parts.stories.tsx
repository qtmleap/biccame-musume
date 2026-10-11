import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { Bar, BarChart } from 'recharts'
import {
  EmulatedStatusBadge,
  EmulatedVerifyBadge,
  StartUnknownBadge
} from '@/components/admin/event-detect/emulated-parts'
import { ListSkeleton } from '@/components/admin/event-detect/loading'
import { SectionHeading } from '@/components/admin/event-detect/section'
import { SortableTh, Td, TdNum, Th, ThGroup, ThNum } from '@/components/admin/event-detect/table-parts'
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'

const DetectionTable = () => {
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  return (
    <Table>
      <TableCaption>合成データの検出件数</TableCaption>
      <TableHeader>
        <TableRow>
          <Th rowSpan={2}>店舗</Th>
          <ThGroup colSpan={2}>投稿</ThGroup>
          <TableHead rowSpan={2}>メモ</TableHead>
        </TableRow>
        <TableRow>
          <SortableTh numeric label='候補' order={order} onSort={() => setOrder(order === 'desc' ? 'asc' : 'desc')} />
          <ThNum>正解</ThNum>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <Td>合成あべの店</Td>
          <TdNum>12</TdNum>
          <TdNum>8</TdNum>
          <TableCell>表示専用</TableCell>
        </TableRow>
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>合計</TableCell>
          <TdNum>12</TdNum>
          <TdNum>8</TdNum>
          <TableCell>1 店舗</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  )
}
const meta = {
  title: 'Components/admin/event-detect-parts',
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div data-testid='production-component'>
        <Story />
      </div>
    )
  ]
} satisfies Meta
export default meta
type Story = StoryObj<typeof meta>
export const CountsTable: Story = {
  render: () => <DetectionTable />,
  parameters: {
    catalogue: {
      sources: [
        'workers/web/src/app/components/admin/event-detect/table-parts.tsx#Th',
        'workers/web/src/app/components/admin/event-detect/table-parts.tsx#ThNum',
        'workers/web/src/app/components/admin/event-detect/table-parts.tsx#ThGroup',
        'workers/web/src/app/components/admin/event-detect/table-parts.tsx#SortableTh',
        'workers/web/src/app/components/admin/event-detect/table-parts.tsx#Td',
        'workers/web/src/app/components/admin/event-detect/table-parts.tsx#TdNum',
        'workers/web/src/app/components/ui/table.tsx#Table',
        'workers/web/src/app/components/ui/table.tsx#TableHeader',
        'workers/web/src/app/components/ui/table.tsx#TableBody',
        'workers/web/src/app/components/ui/table.tsx#TableFooter',
        'workers/web/src/app/components/ui/table.tsx#TableHead',
        'workers/web/src/app/components/ui/table.tsx#TableRow',
        'workers/web/src/app/components/ui/table.tsx#TableCell',
        'workers/web/src/app/components/ui/table.tsx#TableCaption'
      ]
    }
  }
}
export const Statuses: Story = {
  render: () => (
    <div className='flex flex-wrap gap-3'>
      <EmulatedStatusBadge status='announce' />
      <EmulatedVerifyBadge verify={{ choice: 'new', probability: 0.93, merged: false }} />
      <StartUnknownBadge />
    </div>
  ),
  parameters: {
    catalogue: { sources: ['workers/web/src/app/components/admin/event-detect/emulated-parts.tsx#StartUnknownBadge'] }
  }
}
export const LoadingList: Story = {
  render: () => (
    <>
      <SectionHeading aside='合成データ'>投稿</SectionHeading>
      <ListSkeleton />
    </>
  ),
  parameters: {
    catalogue: {
      expectedLoading: true,
      sources: [
        'workers/web/src/app/components/admin/event-detect/loading.tsx#ListSkeleton',
        'workers/web/src/app/components/admin/event-detect/section.tsx#SectionHeading'
      ]
    }
  }
}
export const ChartTooltip: Story = {
  render: () => (
    <ChartContainer config={{ count: { label: '候補', color: 'var(--chart-1)' } }} className='h-64 w-full'>
      <BarChart data={[{ name: '合成店舗', count: 12 }]}>
        <Bar dataKey='count' fill='var(--color-count)' isAnimationActive={false} />
        <foreignObject x={40} y={20} width={160} height={100}>
          <ChartTooltipContent
            active
            label='合成店舗'
            payload={[
              {
                graphicalItemId: 'synthetic-count',
                name: 'count',
                dataKey: 'count',
                value: 12,
                color: 'var(--chart-1)',
                payload: { name: '合成店舗', count: 12 }
              }
            ]}
          />
        </foreignObject>
      </BarChart>
    </ChartContainer>
  ),
  parameters: { catalogue: { sources: ['workers/web/src/app/components/ui/chart.tsx#ChartTooltipContent'] } }
}
