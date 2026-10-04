import { useAtom } from 'jotai'
import { motion } from 'motion/react'
import { RadioGroup } from 'radix-ui'
import { type RegionType, regionFilterAtom } from '@/atoms/filter-atom'
import { FilterHeader } from '@/components/common/filter-header'
import { STICKER_HOVER_TRANSITION, STICKER_SHADOW_SM } from '@/lib/sticker'
import { cn } from '@/lib/utils'
import { FILTER_LABELS, REGION_LABELS } from '@/locales/app.content'
import { RegionSchema } from '@/schemas/store.dto'

/**
 * 地域フィルター制御コンポーネント
 */
type RegionFilterControlProps = {
  value: RegionType
  onChange: (value: RegionType) => void
}

export const RegionFilterControl = (props: RegionFilterControlProps | Record<string, never>) => {
  if ('value' in props) return <ControlledRegionFilter value={props.value} onChange={props.onChange} />
  return <CharacterRegionFilter />
}

const CharacterRegionFilter = () => {
  const [region, setRegion] = useAtom(regionFilterAtom)
  return <ControlledRegionFilter value={region} onChange={setRegion} />
}

const ControlledRegionFilter = ({ value: region, onChange: setRegion }: RegionFilterControlProps) => {
  const regionOptions = RegionSchema.options.map((value) => ({
    value,
    label: REGION_LABELS[value]
  }))

  const regionButtons = (
    <RadioGroup.Root
      value={region}
      onValueChange={(value) => {
        const result = RegionSchema.safeParse(value)
        if (result.success) setRegion(result.data)
      }}
      aria-label={FILTER_LABELS.region}
      className='grid grid-cols-3 sm:grid-cols-6 gap-2 py-1'
    >
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
            <RadioGroup.Item
              value={option.value}
              className={cn(
                'inline-flex h-8 items-center justify-center px-3 w-full text-sm font-medium rounded-full border transition-colors outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                isSelected
                  ? 'bg-brand text-brand-foreground border-brand hover:bg-brand/90'
                  : 'bg-button-surface text-foreground border-card-border hover:bg-button-surface-hover'
              )}
            >
              {option.label}
            </RadioGroup.Item>
          </motion.div>
        )
      })}
    </RadioGroup.Root>
  )

  return (
    <div className='w-full'>
      <FilterHeader label={FILTER_LABELS.region} />
      {regionButtons}
    </div>
  )
}
