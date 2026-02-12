import { useAtom } from 'jotai'
import { ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { type SortType, sortTypeAtom } from '@/atoms/sort-atom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SORT_LABELS } from '@/locales/app.content'

type CharacterSortControlProps = {
  onRandomize: () => void
}

/**
 * キャラクターソート制御コンポーネント
 */
export const CharacterSortControl = ({ onRandomize }: CharacterSortControlProps) => {
  const [sortType, setSortType] = useAtom(sortTypeAtom)
  const [isOpen, setIsOpen] = useState(false)

  const handleSortChange = (value: SortType) => {
    setSortType(value)
    // ランダムの場合は毎回カウンターをインクリメント
    if (value === 'random') {
      onRandomize()
    }
    // モバイルでは選択後に閉じる
    setIsOpen(false)
  }

  const sortOptions: { value: SortType; label: string }[] = [
    { value: 'random', label: SORT_LABELS.random },
    { value: 'character_birthday', label: SORT_LABELS.characterBirthday },
    { value: 'store_birthday', label: SORT_LABELS.storeBirthday },
    { value: 'upcoming_birthday', label: SORT_LABELS.upcomingBirthday }
  ]

  const currentOption = sortOptions.find((opt) => opt.value === sortType)

  return (
    <div className='w-full'>
      {/* モバイル用ヘッダー（タップで開閉） */}
      <button
        type='button'
        onClick={() => setIsOpen(!isOpen)}
        className='flex items-center justify-between w-full sm:hidden mb-3'
      >
        <div className='flex items-center gap-2'>
          <ArrowUpDown className='h-4 w-4 text-gray-600' />
          <span className='text-sm font-medium text-gray-700'>並び替え: {currentOption?.label}</span>
        </div>
        {isOpen ? <ChevronUp className='h-4 w-4 text-gray-600' /> : <ChevronDown className='h-4 w-4 text-gray-600' />}
      </button>

      {/* デスクトップ用ヘッダー */}
      <div className='hidden sm:flex items-center gap-2 mb-3'>
        <ArrowUpDown className='h-4 w-4 text-gray-600' />
        <span className='text-sm font-medium text-gray-700'>並び替え</span>
      </div>

      {/* ボタングリッド（モバイルでは開閉可能） */}
      <AnimatePresence initial={false}>
        {(isOpen || true) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{
              height: isOpen ? 'auto' : 0,
              opacity: isOpen ? 1 : 0
            }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className='overflow-hidden sm:h-auto! sm:opacity-100!'
          >
            <div className='grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 sm:mt-0'>
              {sortOptions.map((option) => {
                const isSelected = sortType === option.value

                return (
                  <Button
                    key={option.value}
                    variant='outline'
                    size='sm'
                    onClick={() => handleSortChange(option.value)}
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
