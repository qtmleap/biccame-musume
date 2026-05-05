import { useAtom } from 'jotai'
import { ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { type SortType, sortTypeAtom } from '@/atoms/sort-atom'
import { Button } from '@/components/ui/button'
import { DURATION } from '@/lib/motion'
import { STICKER_HOVER_TRANSITION, STICKER_SHADOW_SM } from '@/lib/sticker'
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
          <ArrowUpDown className='h-4 w-4 text-muted-foreground' />
          <span className='text-sm font-medium text-muted-foreground'>並び替え: {currentOption?.label}</span>
        </div>
        {isOpen ? (
          <ChevronUp className='h-4 w-4 text-muted-foreground' />
        ) : (
          <ChevronDown className='h-4 w-4 text-muted-foreground' />
        )}
      </button>

      {/* デスクトップ用ヘッダー */}
      <div className='hidden sm:flex items-center gap-2 mb-3'>
        <ArrowUpDown className='h-4 w-4 text-muted-foreground' />
        <span className='text-sm font-medium text-muted-foreground'>並び替え</span>
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
            transition={{ duration: DURATION.normal, ease: 'easeInOut' }}
            className='overflow-hidden sm:h-auto! sm:opacity-100!'
          >
            <div className='grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 sm:mt-0'>
              {sortOptions.map((option) => {
                const isSelected = sortType === option.value

                return (
                  <motion.div
                    key={option.value}
                    className='w-full'
                    style={{ filter: STICKER_SHADOW_SM }}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    transition={STICKER_HOVER_TRANSITION}
                  >
                    <Button
                      variant='secondary'
                      size='sm'
                      onClick={() => handleSortChange(option.value)}
                      className={cn(
                        'w-full text-sm rounded-full border',
                        isSelected
                          ? 'bg-brand text-brand-foreground border-brand hover:bg-brand/90'
                          : 'bg-button-surface text-foreground border-card-border hover:bg-button-surface-hover'
                      )}
                    >
                      {option.label}
                    </Button>
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
