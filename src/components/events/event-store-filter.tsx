import { useAtom } from 'jotai'
import { eventListStoreFilterAtom } from '@/atoms/event-list-store-filter-atom'
import { FilterHeader } from '@/components/common/filter-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FILTER_LABELS, STORE_NAME_LABELS } from '@/locales/app.content'
import { type StoreKey, StoreKeySchema } from '@/schemas/store.dto'

const ALL_VALUE = '__all__'

/**
 * 店舗フィルター制御コンポーネント
 */
export const EventStoreFilter = () => {
  const [storeFilter, setStoreFilter] = useAtom(eventListStoreFilterAtom)

  const storeOptions = StoreKeySchema.options
    .map((value) => ({ value, label: STORE_NAME_LABELS[value] ?? value }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ja'))

  const handleChange = (value: string) => {
    setStoreFilter(value === ALL_VALUE ? null : (value as StoreKey))
  }

  return (
    <div className='w-full'>
      <FilterHeader label={FILTER_LABELS.store} />
      <Select value={storeFilter ?? ALL_VALUE} onValueChange={handleChange}>
        <SelectTrigger size='sm' className='w-full'>
          <SelectValue placeholder={FILTER_LABELS.storeAll} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>{FILTER_LABELS.storeAll}</SelectItem>
          {storeOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
