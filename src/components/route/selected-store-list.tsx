import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { SelectedStore } from './types'

type Props = {
  stores: SelectedStore[]
  onRemove: (storeId: string) => void
  onChangeStation: (storeId: string, station: string) => void
  onClearAll: () => void
}

/**
 * 選択済み店舗リスト（縦並び、駅選択可能）
 */
export const SelectedStoreList = ({ stores, onRemove, onChangeStation, onClearAll }: Props) => {
  if (stores.length === 0) return null

  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between'>
        <span className='text-muted-foreground text-sm'>選択中: {stores.length}店舗</span>
        <Button variant='ghost' size='sm' onClick={onClearAll}>
          <Trash2 className='size-4' />
          全てクリア
        </Button>
      </div>
      <div className='space-y-2'>
        {stores.map((store, index) => (
          <div key={store.id} className='bg-secondary/50 flex items-center justify-between gap-2 rounded-lg p-3'>
            <div className='flex items-center gap-2'>
              <span className='flex size-6 shrink-0 items-center justify-center rounded-full border text-xs'>
                {index + 1}
              </span>
              <span className='text-sm font-medium'>{store.name}</span>
            </div>
            <div className='flex items-center gap-2'>
              <Select
                value={store.station}
                onValueChange={(v) => onChangeStation(store.id, v)}
                disabled={store.stations.length === 1}
              >
                <SelectTrigger className='h-8 w-auto min-w-[120px]'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {store.stations.map((station) => (
                    <SelectItem key={station} value={station}>
                      {station}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant='ghost' size='icon-sm' className='size-8' onClick={() => onRemove(store.id)}>
                <Trash2 className='size-4' />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
