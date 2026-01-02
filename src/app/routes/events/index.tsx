import { createFileRoute, Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { Gantt, type Task, ViewMode } from 'gantt-task-react'
import 'gantt-task-react/dist/index.css'
import { Gift, Settings } from 'lucide-react'
import { Suspense, useMemo, useState } from 'react'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useEvents } from '@/hooks/useEvents'
import type { AckeyCampaign } from '@/schemas/ackey-campaign.dto'

/**
 * カテゴリラベル
 */
const CATEGORY_LABELS: Record<AckeyCampaign['category'], string> = {
  ackey: 'アクキー',
  limited_card: '限定名刺',
  other: 'その他'
}

/**
 * カテゴリチェックボックス色
 */
const CATEGORY_CHECKBOX_COLORS: Record<AckeyCampaign['category'], string> = {
  ackey: 'border-amber-500 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500',
  limited_card: 'border-purple-500 data-[state=checked]:bg-purple-500 data-[state=checked]:border-purple-500',
  other: 'border-pink-500 data-[state=checked]:bg-pink-500 data-[state=checked]:border-pink-500'
}

/**
 * タスクリストのヘッダー（名前のみ）
 */
const TaskListHeader = ({ headerHeight, rowWidth }: { headerHeight: number; rowWidth: string }) => {
  return (
    <div
      className='flex items-end border-b border-r px-3 pb-2 font-medium text-sm'
      style={{ height: headerHeight, width: rowWidth }}
    >
      イベント名
    </div>
  )
}

/**
 * タスクリストのテーブル（名前のみ）
 */
const TaskListTable: React.FC<{
  tasks: Task[]
  rowHeight: number
  rowWidth: string
  onExpanderClick: (task: Task) => void
}> = ({ tasks, rowHeight, rowWidth }) => {
  return (
    <TooltipProvider>
      <div className='text-sm'>
        {tasks.map((task) => (
          <Tooltip key={task.id}>
            <TooltipTrigger asChild>
              <div
                className='flex items-center border-b border-r px-3 truncate cursor-default'
                style={{ height: rowHeight, width: rowWidth }}
              >
                {task.name}
              </div>
            </TooltipTrigger>
            <TooltipContent side='right' className='max-w-xs'>
              <p>{task.name}</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  )
}

/**
 * カテゴリに応じた色を返す
 */
const getCategoryColor = (category: AckeyCampaign['category']) => {
  switch (category) {
    case 'limited_card':
      return { backgroundColor: '#a855f7', backgroundSelectedColor: '#9333ea' }
    case 'ackey':
      return { backgroundColor: '#f59e0b', backgroundSelectedColor: '#d97706' }
    case 'other':
    default:
      return { backgroundColor: '#ec4899', backgroundSelectedColor: '#db2777' }
  }
}

/**
 * イベントをGanttタスクに変換
 */
const eventToTask = (event: AckeyCampaign): Task => {
  const start = dayjs(event.startDate)
  const startDate = start.toDate()
  // 終了日がない場合は、月末か開始日から14日後のどちらか長い方
  let endDate: Date
  if (event.endDate) {
    endDate = dayjs(event.endDate).toDate()
  } else {
    const endOfMonth = start.endOf('month')
    const plus14Days = start.add(14, 'day')
    endDate = endOfMonth.isAfter(plus14Days) ? endOfMonth.toDate() : plus14Days.toDate()
  }
  const colors = getCategoryColor(event.category)

  return {
    id: event.id,
    name: event.name,
    start: startDate,
    end: endDate,
    progress: 100,
    type: 'task',
    isDisabled: true,
    styles: {
      backgroundColor: colors.backgroundColor,
      backgroundSelectedColor: colors.backgroundSelectedColor,
      progressColor: colors.backgroundColor,
      progressSelectedColor: colors.backgroundSelectedColor
    }
  }
}

/**
 * イベント一覧のコンテンツ
 */
const EventsContent = () => {
  const { data: events = [], isLoading } = useEvents()
  const [categoryFilter, setCategoryFilter] = useState<Set<AckeyCampaign['category']>>(
    new Set(['ackey', 'limited_card', 'other'])
  )

  /**
   * カテゴリフィルターのトグル
   */
  const toggleCategory = (category: AckeyCampaign['category']) => {
    setCategoryFilter((prev) => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

  // 開催中・開催予定のイベントをフィルタリング
  const activeEvents = useMemo(() => {
    const now = dayjs()
    return events
      .filter((event) => {
        if (event.isEnded) return false
        // カテゴリフィルター
        if (!categoryFilter.has(event.category)) return false
        const startDate = dayjs(event.startDate)
        const endDate = event.endDate ? dayjs(event.endDate) : null
        // 開催中: 開始日が現在以前で、終了日がないか終了日が現在以降
        const isOngoing = startDate.isBefore(now) && (!endDate || endDate.isAfter(now))
        // 開催予定: 開始日が現在以降
        const isUpcoming = startDate.isAfter(now)
        return isOngoing || isUpcoming
      })
      .sort((a, b) => dayjs(a.startDate).valueOf() - dayjs(b.startDate).valueOf())
  }, [events, categoryFilter])

  // Ganttタスクに変換
  const tasks: Task[] = useMemo(() => {
    if (activeEvents.length === 0) return []
    return activeEvents.map((event) => eventToTask(event))
  }, [activeEvents])

  /**
   * タスククリック時のハンドラ
   */
  const handleTaskClick = (task: Task) => {
    const event = activeEvents.find((e) => e.id === task.id)
    if (event?.referenceUrls?.[0]?.url) {
      window.open(event.referenceUrls[0].url, '_blank')
    }
  }

  if (isLoading) {
    return <LoadingFallback />
  }

  return (
    <div className='mx-auto p-4 md:p-8 space-y-4 max-w-6xl'>
      {/* ヘッダー */}
      <div className='flex items-center justify-between'>
        <div>
          <div className='flex items-center gap-2 mb-2'>
            <Gift className='size-5 text-[#e50012]' />
            <h1 className='text-xl font-bold text-gray-800'>イベント一覧</h1>
          </div>
          <p className='text-sm text-gray-600'>開催中・開催予定のイベント</p>
        </div>
        <Link
          to='/admin/events'
          className='flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors'
        >
          <Settings className='size-4' />
          <span>管理</span>
        </Link>
      </div>

      {/* カテゴリフィルター */}
      <div className='flex flex-wrap gap-4 text-sm'>
        {(['ackey', 'limited_card', 'other'] as const).map((category) => (
          <label key={category} className='flex items-center gap-2 cursor-pointer'>
            <Checkbox
              checked={categoryFilter.has(category)}
              onCheckedChange={() => toggleCategory(category)}
              className={CATEGORY_CHECKBOX_COLORS[category]}
            />
            <span>{CATEGORY_LABELS[category]}</span>
          </label>
        ))}
      </div>

      {/* ガントチャート */}
      {tasks.length > 0 ? (
          <Gantt
            tasks={tasks}
            viewMode={ViewMode.Day}
            onClick={handleTaskClick}
            listCellWidth='200px'
            columnWidth={65}
            headerHeight={50}
            rowHeight={50}
            barCornerRadius={4}
            todayColor='rgba(229, 0, 18, 0.1)'
            locale='ja-JP'
            TaskListHeader={TaskListHeader}
            TaskListTable={TaskListTable}
          />
      ) : (
        <div className='text-center py-12 text-gray-500'>
          <Gift className='size-12 mx-auto mb-4 opacity-30' />
          <p>開催中・開催予定のイベントはありません</p>
        </div>
      )}
    </div>
  )
}

/**
 * イベント一覧ページ
 */
const EventsPage = () => {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <EventsContent />
    </Suspense>
  )
}

export const Route = createFileRoute('/events/')({
  component: EventsPage
})
