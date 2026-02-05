import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { AvailableStore } from './types'

type Props = {
  stores: AvailableStore[]
  onSelect: (storeId: string) => void
  disabled?: boolean
}

/**
 * 店舗追加用セレクトボックス
 */
export const StoreSelect = ({ stores, onSelect, disabled }: Props) => {
  return (
    <Select onValueChange={onSelect} value='' disabled={disabled}>
      <SelectTrigger className='w-full'>
        <SelectValue placeholder={disabled ? '最大5店舗まで' : '店舗を追加...'} />
      </SelectTrigger>
      <SelectContent>
        {stores.map((store) => (
          <SelectItem key={store.id} value={store.id}>
            {store.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
