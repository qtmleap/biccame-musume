import type { WritableAtom } from 'jotai'
import { useAtom } from 'jotai'
import { FilterHeader } from '@/components/common/filter-header'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { EVENT_STATUS_LABELS, FILTER_LABELS } from '@/locales/app.content'

type StatusFilter = {
  upcoming: boolean
  ongoing: boolean
  ended: boolean
}

type EventStatusFilterProps = {
  statusFilterAtom: WritableAtom<StatusFilter, [StatusFilter], void>
}

/**
 * イベントステータスフィルタコンポーネント
 */
export const EventStatusFilter = ({ statusFilterAtom }: EventStatusFilterProps) => {
  const [statusFilter, setStatusFilter] = useAtom(statusFilterAtom)

  return (
    <div className='w-full'>
      <FilterHeader label={FILTER_LABELS.status} />
      <div className='flex items-center gap-4'>
        <div className='flex items-center gap-2'>
          <Checkbox
            id='status-upcoming'
            checked={statusFilter.upcoming}
            onCheckedChange={(checked) => setStatusFilter({ ...statusFilter, upcoming: checked === true })}
            className='border-gray-400 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600'
          />
          <Label htmlFor='status-upcoming' className='text-gray-700 cursor-pointer'>
            {EVENT_STATUS_LABELS.upcoming}
          </Label>
        </div>
        <div className='flex items-center gap-2'>
          <Checkbox
            id='status-ongoing'
            checked={statusFilter.ongoing}
            onCheckedChange={(checked) => setStatusFilter({ ...statusFilter, ongoing: checked === true })}
            className='border-gray-400 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600'
          />
          <Label htmlFor='status-ongoing' className='text-gray-700 cursor-pointer'>
            {EVENT_STATUS_LABELS.ongoing}
          </Label>
        </div>
        <div className='flex items-center gap-2'>
          <Checkbox
            id='status-ended'
            checked={statusFilter.ended}
            onCheckedChange={(checked) => setStatusFilter({ ...statusFilter, ended: checked === true })}
            className='border-gray-400 data-[state=checked]:bg-gray-600 data-[state=checked]:border-gray-600'
          />
          <Label htmlFor='status-ended' className='text-gray-700 cursor-pointer'>
            {EVENT_STATUS_LABELS.ended}
          </Label>
        </div>
      </div>
    </div>
  )
}
