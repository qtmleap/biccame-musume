import { Filter, type LucideIcon } from 'lucide-react'

type FilterHeaderProps = {
  label: string
  icon?: LucideIcon
}

/**
 * フィルターセクションのヘッダー
 */
export const FilterHeader = ({ label, icon: Icon = Filter }: FilterHeaderProps) => {
  return (
    <div className='flex items-center gap-2 mb-3'>
      <Icon className='h-4 w-4 text-gray-600' />
      <span className='text-sm font-medium text-gray-700'>{label}</span>
    </div>
  )
}
