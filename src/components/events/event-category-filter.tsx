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
  ackey: 'border-amber-500 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500',
  limited_card: 'border-purple-500 data-[state=checked]:bg-purple-500 data-[state=checked]:border-purple-500',
  regular_card: 'border-blue-500 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500',
  other: 'border-pink-500 data-[state=checked]:bg-pink-500 data-[state=checked]:border-pink-500'
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
