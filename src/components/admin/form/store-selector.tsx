import { Store, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ADMIN_LABELS, STORE_NAME_LABELS } from '@/locales/app.content'
import type { StoreKey } from '@/schemas/store.dto'

type StoreSelectFieldProps = {
  allStoreKeys: string[]
  selectedStoreKeys: StoreKey[]
  onAdd: (storeKey: string) => void
  error?: string
}

/**
 * イベントフォームの「開催店舗」 Select セル。 grid セル 1 つ分。
 */
export const StoreSelectField = ({ allStoreKeys, selectedStoreKeys, onAdd, error }: StoreSelectFieldProps) => (
  <div>
    <label htmlFor='store-trigger' className='mb-1.5 flex items-center gap-1.5 text-sm font-medium'>
      <Store className='size-4' />
      開催店舗
    </label>
    <Select value='' onValueChange={onAdd}>
      <SelectTrigger id='store-trigger' className='w-full'>
        <SelectValue
          placeholder={
            selectedStoreKeys.length > 0
              ? ADMIN_LABELS.storeSelected.replace('{count}', selectedStoreKeys.length.toString())
              : ADMIN_LABELS.selectStore
          }
        />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value='_all'>全店舗を選択</SelectItem>
        {allStoreKeys.map((key) => {
          const storeKey = key as StoreKey
          const displayName = STORE_NAME_LABELS[storeKey] || key
          return (
            <SelectItem key={key} value={key} disabled={selectedStoreKeys.includes(storeKey)}>
              {displayName}
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
    {error && <p className='mt-1 text-xs text-destructive'>{error}</p>}
  </div>
)

type SelectedStoreBadgesProps = {
  allStoreKeys: string[]
  selectedStoreKeys: StoreKey[]
  onRemove: (storeKey: string) => void
  onClearAll: () => void
}

/**
 * 選択中の店舗をバッジ形式で表示し、 個別削除 / 全削除を行う UI。
 * 全店舗選択時は「全店舗」バッジ 1 個に集約。
 */
export const SelectedStoreBadges = ({
  allStoreKeys,
  selectedStoreKeys,
  onRemove,
  onClearAll
}: SelectedStoreBadgesProps) => {
  if (selectedStoreKeys.length === 0) return null

  if (selectedStoreKeys.length === allStoreKeys.length) {
    return (
      <div className='flex flex-wrap gap-1.5'>
        <Badge variant='secondary' className='pr-1'>
          <span className='text-xs font-semibold'>全店舗</span>
          <button type='button' onClick={onClearAll} className='ml-0.5 rounded-sm'>
            <X className='size-3' />
          </button>
        </Badge>
      </div>
    )
  }

  return (
    <div className='flex flex-wrap gap-1.5'>
      {selectedStoreKeys.map((key) => {
        const storeKey = key as StoreKey
        const displayName = STORE_NAME_LABELS[storeKey] || key
        return (
          <Badge key={key} variant='secondary' className='pr-1'>
            <span className='text-xs font-semibold'>{displayName}</span>
            <button type='button' onClick={() => onRemove(key)} className='ml-0.5 rounded-sm'>
              <X className='size-3' />
            </button>
          </Badge>
        )
      })}
    </div>
  )
}
