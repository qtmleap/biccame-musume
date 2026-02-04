import { Coins, Gift, Users, X } from 'lucide-react'
import type { UseFieldArrayRemove, UseFieldArrayUpdate, UseFormRegister } from 'react-hook-form'
import { v4 as uuidv4 } from 'uuid'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { EventRequest } from '@/schemas/event.dto'

/**
 * 条件タイプ（配布条件のタイプ）
 */
type ConditionType = 'purchase' | 'first_come' | 'lottery' | 'everyone'

/**
 * 条件フィールドの型
 */
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
  update: UseFieldArrayUpdate<EventRequest, 'conditions'>
  error?: string
}

/**
 * 配布条件セクションコンポーネント
 * 購入金額・先着・抽選・全員配布の条件を管理
 */
export function ConditionsSection({ fields, register, remove, update, error }: Props) {
  /**
   * 指定タイプの条件が既に存在するか
   */
  const hasConditionType = (type: ConditionType) => fields.some((f) => f.type === type)

  /**
   * 配布方法（先着・抽選・全員）が既に設定されているか
   */
  const hasDistributionCondition = () =>
    hasConditionType('first_come') || hasConditionType('lottery') || hasConditionType('everyone')

  /**
   * 条件を追加
   */
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
    update(fields.length, newCondition as ConditionField)
  }

  /**
   * 数量を更新
   */
  const handleUpdateQuantity = (index: number, quantity: number) => {
    const field = fields[index]
    if (field.type === 'first_come' || field.type === 'lottery') {
      update(index, { ...field, quantity })
    }
  }

  /**
   * 条件タイプボタンのスタイル
   */
  const getButtonClass = (type: ConditionType) =>
    hasConditionType(type) ? 'border-rose-500 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-800' : ''

  return (
    <div>
      <div className='mb-1.5 flex items-center gap-1.5 text-sm font-medium'>
        <Gift className='size-4' />
        配布条件
      </div>
      {/* 条件タイプボタン */}
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
          <Users className='mr-1.5 size-4' />
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
          <Users className='mr-1.5 size-4' />
          全員配布
        </Button>
      </div>
      {error && <p className='mb-2 text-xs text-destructive'>{error}</p>}

      {/* 条件リスト */}
      <div className='grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-x-4'>
        {fields.map((field, index) => (
          <div key={field.id} className={index % 2 === 0 && fields.length > 1 ? 'sm:border-r sm:pr-4' : ''}>
            <div className='flex items-center gap-2'>
              <div className='flex-1'>
                {field.type === 'purchase' && (
                  <div className='flex items-center gap-2'>
                    <Coins className='size-4 shrink-0 text-muted-foreground' />
                    <Input
                      type='number'
                      min='0'
                      step='1'
                      {...register(`conditions.${index}.purchaseAmount`, { valueAsNumber: true })}
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
                      {...register(`conditions.${index}.quantity`, { valueAsNumber: true })}
                      onChange={(e) => handleUpdateQuantity(index, Number.parseInt(e.target.value, 10) || 1)}
                      className='w-full'
                    />
                    <span className='shrink-0 text-sm text-muted-foreground'>名</span>
                  </div>
                )}
                {field.type === 'lottery' && (
                  <div className='flex items-center gap-2'>
                    <Users className='size-4 shrink-0 text-muted-foreground' />
                    <Input
                      type='number'
                      min='1'
                      {...register(`conditions.${index}.quantity`, { valueAsNumber: true })}
                      onChange={(e) => handleUpdateQuantity(index, Number.parseInt(e.target.value, 10) || 1)}
                      className='w-full'
                    />
                    <span className='shrink-0 text-sm text-muted-foreground'>名</span>
                  </div>
                )}
                {field.type === 'everyone' && (
                  <div className='flex items-center gap-2'>
                    <Users className='size-4 shrink-0 text-muted-foreground' />
                    <span className='text-sm text-muted-foreground'>全員配布</span>
                  </div>
                )}
              </div>
              <Button type='button' size='icon' variant='ghost' onClick={() => remove(index)} className='shrink-0'>
                <X className='size-4' />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
