import { useAtom } from 'jotai'
import { Filter } from 'lucide-react'
import { regionFilterAtom } from '@/atoms/filterAtom'
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

  return (
    <div className='w-full'>
      <div className='flex items-center gap-2 mb-3'>
        <Filter className='h-4 w-4 text-gray-600' />
        <span className='text-sm font-medium text-gray-700'>地域で絞り込み</span>
      </div>
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
                'w-full text-xs',
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
    </div>
  )
}
