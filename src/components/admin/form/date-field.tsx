import { Calendar, X } from 'lucide-react'
import type { UseFormRegisterReturn } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type DateFieldProps = {
  id: string
  label: string
  register: UseFormRegisterReturn
  error?: string
  clearable?: boolean
  onClear?: () => void
  hint?: string
}

/**
 * 日付入力フィールドコンポーネント
 */
export const DateField = ({ id, label, register, error, clearable, onClear, hint }: DateFieldProps) => {
  const handleClear = () => {
    const input = document.getElementById(id) as HTMLInputElement
    if (input) input.value = ''
    onClear?.()
  }

  return (
    <div>
      <label htmlFor={id} className='mb-1 flex items-center gap-1.5 text-sm font-medium'>
        <Calendar className='size-4' />
        {label}
      </label>
      <div className='flex gap-2'>
        <Input id={id} type='date' {...register} className={clearable ? 'flex-1' : 'w-full'} />
        {clearable && (
          <Button type='button' variant='ghost' size='icon' onClick={handleClear} title={`${label}をクリア`}>
            <X className='size-4' />
          </Button>
        )}
      </div>
      {error && <p className='mt-1 text-xs text-destructive'>{error}</p>}
      {hint && <p className='mt-1 text-xs text-gray-500'>{hint}</p>}
    </div>
  )
}
