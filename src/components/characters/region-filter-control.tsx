import { useAtom } from 'jotai'
import { motion } from 'motion/react'
import { regionFilterAtom } from '@/atoms/filter-atom'
import { FilterHeader } from '@/components/common/filter-header'
import { Button } from '@/components/ui/button'
import { STICKER_HOVER_TRANSITION, STICKER_SHADOW_SM } from '@/lib/sticker'
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
              onClick={() => setRegion(option.value)}
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
  )

  return (
    <div className='w-full'>
      <FilterHeader label={FILTER_LABELS.region} />
      {regionButtons}
    </div>
  )
}
