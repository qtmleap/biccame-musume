import { Calendar, X } from 'lucide-react'
import type { ChangeEvent } from 'react'
import { type Control, type FieldPath, type FieldValues, useController } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type DateFieldProps<T extends FieldValues> = {
  id: string
  label: string
  control: Control<T>
  name: FieldPath<T>
  error?: string
  clearable?: boolean
  hint?: string
}

/**
 * 日付入力フィールドコンポーネント
 *
 * `<input type="date">` は未入力時に value を `''` で返すが、optional な
 * 日付フィールドは undefined を期待しているため、空文字を undefined に
 * 寄せて RHF の状態に流す。
 */
export const DateField = <T extends FieldValues>({
  id,
  label,
  control,
  name,
  error,
  clearable,
  hint
}: DateFieldProps<T>) => {
  const { field } = useController({ name, control })

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    field.onChange(value === '' ? undefined : value)
  }

  return (
    <div>
      <label htmlFor={id} className='mb-1 flex items-center gap-1.5 text-sm font-medium'>
        <Calendar className='size-4' />
        {label}
      </label>
      <div className='flex gap-2'>
        <Input
          id={id}
          type='date'
          value={(field.value as string | undefined) ?? ''}
          onChange={handleChange}
          onBlur={field.onBlur}
          name={field.name}
          ref={field.ref}
          className={clearable ? 'flex-1' : 'w-full'}
        />
        {clearable && (
          <Button
            type='button'
            variant='ghost'
            size='icon'
            onClick={() => field.onChange(undefined)}
            title={`${label}をクリア`}
            className='border border-transparent'
          >
            <X className='size-4' />
          </Button>
        )}
      </div>
      {error && <p className='mt-1 text-xs text-destructive'>{error}</p>}
      {hint && <p className='mt-1 text-xs text-muted-foreground'>{hint}</p>}
    </div>
  )
}
