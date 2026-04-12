import { useAtom } from 'jotai'
import { regionFilterAtom } from '@/atoms/filter-atom'
import { FilterHeader } from '@/components/common/filter-header'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
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
            variant='outline'
            size='sm'
            onClick={() => setRegion(option.value)}
            className={cn(
              'w-full text-sm h-8',
              isSelected
                ? 'bg-green-500/50 text-white border-green-500/50 hover:bg-green-500/60 hover:text-white'
                : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200 hover:text-gray-700'
            )}
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
