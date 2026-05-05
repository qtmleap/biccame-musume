import { Coins, Dice5, Gift, Megaphone, Users, X } from 'lucide-react'
import type { UseFieldArrayAppend, UseFieldArrayRemove, UseFormRegister } from 'react-hook-form'
import { v4 as uuidv4 } from 'uuid'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { EventRequest } from '@/schemas/event.dto'

type ConditionType = 'purchase' | 'first_come' | 'lottery' | 'everyone'

type ConditionField = {
  id: string
  uuid: string
  type: ConditionType
  purchaseAmount?: number
  quantity?: number
}

type Props = {
  fields: ConditionField[]
  register: UseFormRegister<EventRequest>
  remove: UseFieldArrayRemove
  append: UseFieldArrayAppend<EventRequest, 'conditions'>
  error?: string
}

const setValueAs = (v: unknown) => (v === '' || v === null || v === undefined ? undefined : Number(v))

export function ConditionsSection({ fields, register, remove, append, error }: Props) {
  const hasConditionType = (type: ConditionType) => fields.some((f) => f.type === type)

  const hasDistributionCondition = () =>
    hasConditionType('first_come') || hasConditionType('lottery') || hasConditionType('everyone')

  const handleAdd = (type: ConditionType) => {
    if (hasConditionType(type)) {
      const idx = fields.findIndex((f) => f.type === type)
      if (idx !== -1) remove(idx)
      return
    }
    const newCondition =
      type === 'purchase'
        ? { uuid: uuidv4(), type, purchaseAmount: 3000 }
        : type === 'everyone'
          ? { uuid: uuidv4(), type }
          : { uuid: uuidv4(), type, quantity: 100 }
    append(newCondition as ConditionField)
  }

  const getButtonClass = (type: ConditionType) =>
    hasConditionType(type) ? 'border-destructive bg-destructive/10 text-destructive hover:bg-destructive/20' : ''

  return (
    <div>
      <div className='mb-1.5 flex items-center gap-1.5 text-sm font-medium'>
        <Gift className='size-4' />
        配布条件
      </div>
      <div className='mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4'>
        <Button
          type='button'
          size='sm'
          variant='outline'
          onClick={() => handleAdd('purchase')}
          className={getButtonClass('purchase')}
        >
          <Coins className='mr-1.5 size-4' />
          購入金額
        </Button>
        <Button
          type='button'
          size='sm'
          variant='outline'
          onClick={() => handleAdd('first_come')}
          disabled={hasDistributionCondition() && !hasConditionType('first_come')}
          className={getButtonClass('first_come')}
        >
          <Users className='mr-1.5 size-4' />
          先着
        </Button>
        <Button
          type='button'
          size='sm'
          variant='outline'
          onClick={() => handleAdd('lottery')}
          disabled={hasDistributionCondition() && !hasConditionType('lottery')}
          className={getButtonClass('lottery')}
        >
          <Dice5 className='mr-1.5 size-4' />
          抽選
        </Button>
        <Button
          type='button'
          size='sm'
          variant='outline'
          onClick={() => handleAdd('everyone')}
          disabled={hasDistributionCondition() && !hasConditionType('everyone')}
          className={getButtonClass('everyone')}
        >
          <Megaphone className='mr-1.5 size-4' />
          全員配布
        </Button>
      </div>
      {error && <p className='mb-2 text-xs text-destructive'>{error}</p>}

      <div className='grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-x-4 sm:divide-x sm:divide-card-border'>
        {fields.map((field, index) => (
          <div key={field.id} className={index % 2 === 0 ? 'sm:pr-4' : 'sm:pl-4'}>
            <div className='flex items-center gap-2'>
              <div className='flex-1'>
                {field.type === 'purchase' && (
                  <div className='flex items-center gap-2'>
                    <Coins className='size-4 shrink-0 text-muted-foreground' />
                    <Input
                      type='number'
                      min='0'
                      step='1'
                      {...register(`conditions.${index}.purchaseAmount`, { setValueAs })}
                      className='w-full'
                    />
                    <span className='shrink-0 text-sm text-muted-foreground'>円以上</span>
                  </div>
                )}
                {field.type === 'first_come' && (
                  <div className='flex items-center gap-2'>
                    <Users className='size-4 shrink-0 text-muted-foreground' />
                    <Input
                      type='number'
                      min='1'
                      {...register(`conditions.${index}.quantity`, { setValueAs })}
                      className='w-full'
                    />
                    <span className='shrink-0 text-sm text-muted-foreground'>名</span>
                  </div>
                )}
                {field.type === 'lottery' && (
                  <div className='flex items-center gap-2'>
                    <Dice5 className='size-4 shrink-0 text-muted-foreground' />
                    <Input
                      type='number'
                      min='1'
                      {...register(`conditions.${index}.quantity`, { setValueAs })}
                      className='w-full'
                    />
                    <span className='shrink-0 text-sm text-muted-foreground'>名</span>
                  </div>
                )}
                {field.type === 'everyone' && (
                  <div className='flex items-center gap-2'>
                    <Megaphone className='size-4 shrink-0 text-muted-foreground' />
                    <span className='text-sm text-muted-foreground'>全員配布</span>
                  </div>
                )}
              </div>
              <Button type='button' size='icon' variant='ghost' onClick={() => remove(index)}>
                <X className='size-4' />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
