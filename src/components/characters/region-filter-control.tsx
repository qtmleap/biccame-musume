import { useAtom } from 'jotai'
import { regionFilterAtom } from '@/atoms/filter-atom'
import { FilterHeader } from '@/components/common/filter-header'
import { Button } from '@/components/ui/button'
import { FILTER_LABELS, REGION_LABELS } from '@/locales/app.content'
import { RegionSchema } from '@/schemas/store.dto'

/**
 * 地域フィルター制御コンポーネント
 */
export const RegionFilterControl = () => {
  const [region, setRegion] = useAtom(regionFilterAtom)

  const regionOptions = RegionSchema.options.map((value) => ({
    value,
    label: REGION_LABELS[value]
  }))

  const regionButtons = (
    <div className='grid grid-cols-3 sm:grid-cols-6 gap-2'>
      {regionOptions.map((option) => {
        const isSelected = region === option.value

        return (
          <Button
            key={option.value}
            variant={isSelected ? 'default' : 'outline'}
            size='sm'
            onClick={() => setRegion(option.value)}
            className={
              isSelected ? 'w-full text-sm bg-brand hover:bg-brand/90 text-brand-foreground' : 'w-full text-sm'
            }
          >
            {option.label}
          </Button>
        )
      })}
    </div>
  )

  return (
    <div className='w-full'>
      <FilterHeader label={FILTER_LABELS.region} />
      {regionButtons}
    </div>
  )
}
