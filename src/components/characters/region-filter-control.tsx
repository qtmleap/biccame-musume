import { useAtom } from 'jotai'
import { regionFilterAtom } from '@/atoms/filterAtom'
import { FilterHeader } from '@/components/common/filter-header'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { REGION_LABELS } from '@/locales/app.content'
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
                ? 'bg-green-500/50 text-white border-green-500/50 hover:bg-green-500/60 hover:text-white dark:bg-green-500/50 dark:text-white dark:border-green-500/50 dark:hover:bg-green-500/60'
                : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200 hover:text-gray-700 dark:bg-gray-200/90 dark:text-gray-800 dark:border-gray-300 dark:hover:bg-gray-200 dark:hover:text-gray-800'
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
      <FilterHeader label='地域で絞り込み' />
      {regionButtons}
    </div>
  )
}
