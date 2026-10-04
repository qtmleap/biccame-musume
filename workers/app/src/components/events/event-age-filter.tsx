import { useId } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

export const EventAgeFilter = ({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) => {
  const id = useId()
  return (
    <div className='flex items-center gap-2'>
      <Checkbox id={id} checked={value} onCheckedChange={(checked) => onChange(checked === true)} />
      <Label htmlFor={id} className='cursor-pointer text-sm leading-5'>
        開始から1か月以上経ったイベントを非表示
      </Label>
    </div>
  )
}
