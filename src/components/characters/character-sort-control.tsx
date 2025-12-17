import { useAtom } from 'jotai'
import { ArrowUpDown } from 'lucide-react'
import { type SortType, sortTypeAtom } from '@/atoms/sortAtom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type CharacterSortControlProps = {
  onRandomize: () => void
}

/**
 * キャラクターソート制御コンポーネント
 */
export const CharacterSortControl = ({ onRandomize }: CharacterSortControlProps) => {
  const [sortType, setSortType] = useAtom(sortTypeAtom)

  const handleSortChange = (value: SortType) => {
    setSortType(value)
    // ランダムの場合は毎回カウンターをインクリメント
    if (value === 'random') {
      onRandomize()
    }
  }

  const sortOptions: { value: SortType; label: string }[] = [
    { value: 'character_birthday', label: 'キャラ誕生日順' },
    { value: 'store_birthday', label: '店舗誕生日順' },
    { value: 'upcoming_birthday', label: '誕生日が近い順' },
    { value: 'random', label: 'ランダム' }
  ]

  return (
    <div className='max-w-2xl mx-auto mb-8'>
      <div className='bg-white/80 rounded-lg p-4 shadow-sm'>
        <div className='flex items-center gap-2 mb-3'>
          <ArrowUpDown className='h-4 w-4 text-gray-600' />
          <span className='text-sm font-medium text-gray-700'>並び替え</span>
        </div>
        <div className='grid grid-cols-2 sm:grid-cols-4 gap-2'>
          {sortOptions.map((option) => {
            const isSelected = sortType === option.value
            const isRandom = option.value === 'random'

            return (
              <Button
                key={option.value}
                variant='outline'
                onClick={() => handleSortChange(option.value)}
                {...(isSelected && !isRandom ? { disabled: true } : {})}
                className={cn(
                  'w-full',
                  isSelected
                    ? 'bg-blue-500 text-white border-blue-500 hover:bg-blue-600 hover:text-white dark:bg-blue-500 dark:text-white dark:border-blue-500 dark:hover:bg-blue-600'
                    : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200 hover:text-gray-700 dark:bg-gray-200/90 dark:text-gray-800 dark:border-gray-300 dark:hover:bg-gray-200 dark:hover:text-gray-800'
                )}
              >
                {option.label}
              </Button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
