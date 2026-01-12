import { useAtom } from 'jotai'
import { Filter } from 'lucide-react'
import { categoryFilterAtom } from '@/atoms/categoryFilterAtom'
import { Checkbox } from '@/components/ui/checkbox'
import { type Event, EventCategorySchema } from '@/schemas/event.dto'

/**
 * カテゴリラベル
 */
const CATEGORY_LABELS: Record<Event['category'], string> = {
  ackey: 'アクキー',
  limited_card: '限定名刺',
  regular_card: '通年名刺',
  other: 'その他'
}

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
    setCategoryFilter((prev) => {
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
      <div className='flex items-center gap-2 mb-3'>
        <Filter className='h-4 w-4 text-gray-600' />
        <span className='text-sm font-medium text-gray-700'>種別で絞り込み</span>
      </div>
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
              {CATEGORY_LABELS[category]}
            </label>
          </div>
        ))}
      </div>
    </div>
  )
}
