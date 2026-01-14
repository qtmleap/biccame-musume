import type { WritableAtom } from 'jotai'
import { useAtom } from 'jotai'
import { FilterHeader } from '@/components/common/filter-header'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

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
      <FilterHeader label='開催状況で絞り込み' />
      <div className='flex items-center gap-4'>
        <div className='flex items-center gap-2'>
          <Checkbox
            id='status-upcoming'
            checked={statusFilter.upcoming}
            onCheckedChange={(checked) => setStatusFilter((prev) => ({ ...prev, upcoming: checked === true }))}
            className='border-gray-400 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600'
          />
          <Label htmlFor='status-upcoming' className='text-gray-700 cursor-pointer'>
            開催前
          </Label>
        </div>
        <div className='flex items-center gap-2'>
          <Checkbox
            id='status-ongoing'
            checked={statusFilter.ongoing}
            onCheckedChange={(checked) => setStatusFilter((prev) => ({ ...prev, ongoing: checked === true }))}
            className='border-gray-400 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600'
          />
          <Label htmlFor='status-ongoing' className='text-gray-700 cursor-pointer'>
            開催中
          </Label>
        </div>
        <div className='flex items-center gap-2'>
          <Checkbox
            id='status-ended'
            checked={statusFilter.ended}
            onCheckedChange={(checked) => setStatusFilter((prev) => ({ ...prev, ended: checked === true }))}
            className='border-gray-400 data-[state=checked]:bg-gray-600 data-[state=checked]:border-gray-600'
          />
          <Label htmlFor='status-ended' className='text-gray-700 cursor-pointer'>
            終了済
          </Label>
        </div>
      </div>
    </div>
  )
}
