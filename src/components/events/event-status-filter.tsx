import type { WritableAtom } from 'jotai'
import { useAtom } from 'jotai'
import { useId } from 'react'
import { FilterHeader } from '@/components/common/filter-header'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { EVENT_STATUS_LABELS, FILTER_LABELS } from '@/locales/app.content'

export type StatusFilter = {
  upcoming: boolean
  ongoing: boolean
  ended: boolean
}

type ControlledStatusFilterProps = {
  value: StatusFilter
  onChange: (value: StatusFilter) => void
}

type EventStatusFilterProps =
  | ControlledStatusFilterProps
  | {
      statusFilterAtom: WritableAtom<StatusFilter, [StatusFilter], void>
    }

/**
 * イベントステータスフィルタコンポーネント
 */
export const EventStatusFilter = (props: EventStatusFilterProps) => {
  if ('statusFilterAtom' in props) return <AtomStatusFilter statusFilterAtom={props.statusFilterAtom} />
  return <ControlledStatusFilter {...props} />
}

const AtomStatusFilter = ({
  statusFilterAtom
}: {
  statusFilterAtom: WritableAtom<StatusFilter, [StatusFilter], void>
}) => {
  const [value, onChange] = useAtom(statusFilterAtom)
  return <ControlledStatusFilter value={value} onChange={onChange} />
}

const ControlledStatusFilter = ({ value: statusFilter, onChange: setStatusFilter }: ControlledStatusFilterProps) => {
  const id = useId()
  return (
    <div className='w-full'>
      <FilterHeader label={FILTER_LABELS.status} />
      <div className='flex items-center gap-4'>
        <div className='flex items-center gap-2'>
          <Checkbox
            id={`${id}-status-upcoming`}
            checked={statusFilter.upcoming}
            onCheckedChange={(checked) => setStatusFilter({ ...statusFilter, upcoming: checked === true })}
            className='border-card data-[state=checked]:bg-status-upcoming-foreground data-[state=checked]:border-status-upcoming-foreground'
          />
          <Label htmlFor={`${id}-status-upcoming`} className='text-muted-foreground cursor-pointer'>
            {EVENT_STATUS_LABELS.upcoming}
          </Label>
        </div>
        <div className='flex items-center gap-2'>
          <Checkbox
            id={`${id}-status-ongoing`}
            checked={statusFilter.ongoing}
            onCheckedChange={(checked) => setStatusFilter({ ...statusFilter, ongoing: checked === true })}
            className='border-card data-[state=checked]:bg-success data-[state=checked]:border-success'
          />
          <Label htmlFor={`${id}-status-ongoing`} className='text-muted-foreground cursor-pointer'>
            {EVENT_STATUS_LABELS.ongoing}
          </Label>
        </div>
        <div className='flex items-center gap-2'>
          <Checkbox
            id={`${id}-status-ended`}
            checked={statusFilter.ended}
            onCheckedChange={(checked) => setStatusFilter({ ...statusFilter, ended: checked === true })}
            className='border-card data-[state=checked]:bg-muted-foreground data-[state=checked]:border-muted-foreground'
          />
          <Label htmlFor={`${id}-status-ended`} className='text-muted-foreground cursor-pointer'>
            {EVENT_STATUS_LABELS.ended}
          </Label>
        </div>
      </div>
    </div>
  )
}
