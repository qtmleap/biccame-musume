import { useId } from 'react'
import { FilterHeader } from '@/components/common/filter-header'
import { Checkbox } from '@/components/ui/checkbox'
import { EVENT_CATEGORY_LABELS, FILTER_LABELS } from '@/locales/app.content'
import { type Event, EventCategorySchema } from '@/schemas/event.dto'

/**
 * カテゴリチェックボックス色
 */
const CATEGORY_CHECKBOX_COLORS: Record<Event['category'], string> = {
  ackey:
    'border-category-ackey-solid data-[state=checked]:bg-category-ackey-solid data-[state=checked]:border-category-ackey-solid',
  acsta:
    'border-category-acsta-solid data-[state=checked]:bg-category-acsta-solid data-[state=checked]:border-category-acsta-solid',
  limited_card:
    'border-category-limited-card-solid data-[state=checked]:bg-category-limited-card-solid data-[state=checked]:border-category-limited-card-solid',
  regular_card:
    'border-category-regular-card-solid data-[state=checked]:bg-category-regular-card-solid data-[state=checked]:border-category-regular-card-solid',
  other: 'border-brand data-[state=checked]:bg-brand data-[state=checked]:border-brand'
}

/**
 * イベントカテゴリフィルター
 */
type EventCategoryFilterProps = {
  value: Set<Event['category']>
  onChange: (value: Set<Event['category']>) => void
}

export const EventCategoryFilter = ({ value: categoryFilter, onChange }: EventCategoryFilterProps) => {
  const id = useId()
  /**
   * カテゴリフィルターのトグル
   */
  const toggleCategory = (category: Event['category']) => {
    const next = new Set(categoryFilter)
    if (next.has(category)) {
      next.delete(category)
    } else {
      next.add(category)
    }
    onChange(next)
  }

  return (
    <div className='w-full text-foreground'>
      <FilterHeader label={FILTER_LABELS.category} />
      <div className='flex flex-wrap gap-4 text-sm'>
        {EventCategorySchema.options.map((category) => (
          <div key={category} className='flex items-center gap-2'>
            <Checkbox
              id={`${id}-category-${category}`}
              checked={categoryFilter.has(category)}
              onCheckedChange={() => toggleCategory(category)}
              className={CATEGORY_CHECKBOX_COLORS[category]}
            />
            <label htmlFor={`${id}-category-${category}`} className='cursor-pointer'>
              {EVENT_CATEGORY_LABELS[category]}
            </label>
          </div>
        ))}
      </div>
    </div>
  )
}
