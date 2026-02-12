import { useAtom } from 'jotai'
import { EyeOff } from 'lucide-react'
import { eventUserActivityFilterAtom } from '@/atoms/eventUserActivityFilterAtom'
import { FilterHeader } from '@/components/common/filter-header'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

/**
 * イベントユーザーアクティビティフィルタコンポーネント
 * 興味のあるイベント・達成済みイベントを非表示にする
 */
export const EventUserActivityFilter = () => {
  const [activityFilter, setActivityFilter] = useAtom(eventUserActivityFilterAtom)

  return (
    <div className='w-full'>
      <FilterHeader label='非表示設定' icon={EyeOff} />
      <div className='flex items-center gap-4'>
        <div className='flex items-center gap-2'>
          <Checkbox
            id='activity-interested'
            checked={activityFilter.hideInterested}
            onCheckedChange={(checked) => setActivityFilter({ ...activityFilter, hideInterested: checked === true })}
            className='border-gray-400 data-[state=checked]:bg-yellow-600 data-[state=checked]:border-yellow-600'
          />
          <Label htmlFor='activity-interested' className='text-gray-700 cursor-pointer'>
            興味あり
          </Label>
        </div>
        <div className='flex items-center gap-2'>
          <Checkbox
            id='activity-completed'
            checked={activityFilter.hideCompleted}
            onCheckedChange={(checked) => setActivityFilter({ ...activityFilter, hideCompleted: checked === true })}
            className='border-gray-400 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600'
          />
          <Label htmlFor='activity-completed' className='text-gray-700 cursor-pointer'>
            達成済み
          </Label>
        </div>
      </div>
    </div>
  )
}
