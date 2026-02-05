import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { AvailableStore } from './types'

type Props = {
  stores: AvailableStore[]
  onSelect: (storeId: string) => void
}

/**
 * 店舗追加用セレクトボックス
 */
export const StoreSelect = ({ stores, onSelect }: Props) => {
  return (
    <Select onValueChange={onSelect} value=''>
      <SelectTrigger className='w-full'>
        <SelectValue placeholder='店舗を追加...' />
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
