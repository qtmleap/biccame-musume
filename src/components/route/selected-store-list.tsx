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
        <Button variant='ghost' size='sm' onClick={onClearAll} className='border border-transparent'>
          <Trash2 className='size-4' />
          全てクリア
        </Button>
      </div>
      <div className='space-y-2'>
        {stores.map((store, index) => (
          <div
            key={store.id}
            className='flex min-w-0 flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between'
          >
            <div className='flex min-w-0 items-center gap-2'>
              <span className='flex size-6 shrink-0 items-center justify-center rounded-full border text-xs'>
                {index + 1}
              </span>
              <span className='min-w-0 break-words text-sm font-medium'>{store.name}</span>
            </div>
            <div className='flex min-w-0 items-center gap-2 sm:shrink-0'>
              <Select
                value={store.station}
                onValueChange={(v) => onChangeStation(store.id, v)}
                disabled={store.stations.length === 1}
              >
                <SelectTrigger
                  aria-label={`${store.name}の利用駅`}
                  className='h-9 min-w-0 flex-1 sm:w-auto sm:min-w-[120px]'
                >
                  <SelectValue placeholder='利用駅を選択' />
                </SelectTrigger>
                <SelectContent>
                  {store.stations.map((station) => (
                    <SelectItem key={station} value={station}>
                      {station}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant='ghost'
                size='icon'
                className='size-9 shrink-0 border border-transparent'
                onClick={() => onRemove(store.id)}
                aria-label={`${store.name}をルートから削除`}
              >
                <Trash2 className='size-4' />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
