import { useAtom } from 'jotai'
import { useMemo } from 'react'
import { eventListStoreFilterAtom } from '@/atoms/event-list-store-filter-atom'
import { FilterHeader } from '@/components/common/filter-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCharacters } from '@/hooks/use-characters'
import { FILTER_LABELS, STORE_NAME_LABELS } from '@/locales/app.content'
import type { StoreKey } from '@/schemas/store.dto'

const ALL_VALUE = '__all__'

/**
 * 店舗フィルター制御コンポーネント
 */
export const EventStoreFilter = () => {
  const [storeFilter, setStoreFilter] = useAtom(eventListStoreFilterAtom)
  const { data: characters } = useCharacters()

  const storeOptions = useMemo(
    () =>
      characters
        .filter((c) => c.character?.is_biccame_musume)
        .map((c) => ({ value: c.id as StoreKey, label: STORE_NAME_LABELS[c.id as StoreKey] ?? c.id }))
        .sort((a, b) => a.label.localeCompare(b.label, 'ja')),
    [characters]
  )

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
