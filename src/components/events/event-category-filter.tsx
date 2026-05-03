import { useAtom } from 'jotai'
import { categoryFilterAtom } from '@/atoms/category-filter-atom'
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
  limited_card:
    'border-category-limited-card-solid data-[state=checked]:bg-category-limited-card-solid data-[state=checked]:border-category-limited-card-solid',
  regular_card:
    'border-category-regular-card-solid data-[state=checked]:bg-category-regular-card-solid data-[state=checked]:border-category-regular-card-solid',
  other: 'border-brand data-[state=checked]:bg-brand data-[state=checked]:border-brand'
}

/**
 * イベントカテゴリフィルター
 */
export const EventCategoryFilter = () => {
  const [categoryFilter, setCategoryFilter] = useAtom(categoryFilterAtom)

  /**
   * カテゴリフィルターのトグル
   */
  const toggleCategory = (category: Event['category']) => {
    setCategoryFilter((prev: Set<Event['category']>) => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

  return (
    <div className='w-full'>
      <FilterHeader label={FILTER_LABELS.category} />
      <div className='flex flex-wrap gap-4 text-sm'>
        {EventCategorySchema.options.map((category) => (
          <div key={category} className='flex items-center gap-2'>
            <Checkbox
              id={`category-${category}`}
              checked={categoryFilter.has(category)}
              onCheckedChange={() => toggleCategory(category)}
              className={CATEGORY_CHECKBOX_COLORS[category]}
            />
            <label htmlFor={`category-${category}`} className='cursor-pointer'>
              {EVENT_CATEGORY_LABELS[category]}
            </label>
          </div>
        ))}
      </div>
    </div>
  )
}
