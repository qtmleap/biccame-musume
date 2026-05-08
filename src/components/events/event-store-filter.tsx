import { useMemo } from 'react'
import { FilterHeader } from '@/components/common/filter-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCharacters } from '@/hooks/use-characters'
import { FILTER_LABELS, STORE_NAME_LABELS } from '@/locales/app.content'
import type { StoreKey } from '@/schemas/store.dto'

const ALL_VALUE = '__all__'

type EventStoreFilterProps = {
  value: string | null
  onChange: (value: string | null) => void
}

/**
 * 店舗フィルター制御コンポーネント
 */
export const EventStoreFilter = ({ value, onChange }: EventStoreFilterProps) => {
  const { data: characters } = useCharacters()

  const storeOptions = useMemo(
    () =>
      characters
        .filter((c) => c.store !== undefined)
        .map((c) => ({ value: c.id as StoreKey, label: STORE_NAME_LABELS[c.id as StoreKey] ?? c.id }))
        .sort((a, b) => a.label.localeCompare(b.label, 'ja')),
    [characters]
  )

  const handleChange = (next: string) => {
    onChange(next === ALL_VALUE ? null : (next as StoreKey))
  }

  return (
    <div className='w-full'>
      <FilterHeader label={FILTER_LABELS.store} />
      <Select value={value ?? ALL_VALUE} onValueChange={handleChange}>
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
