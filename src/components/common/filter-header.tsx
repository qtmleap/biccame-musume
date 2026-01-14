import { Filter } from 'lucide-react'

type FilterHeaderProps = {
  label: string
}

/**
 * フィルターセクションのヘッダー
 */
export const FilterHeader = ({ label }: FilterHeaderProps) => {
  return (
    <div className='flex items-center gap-2 mb-3'>
      <Filter className='h-4 w-4 text-gray-600' />
      <span className='text-sm font-medium text-gray-700'>{label}</span>
    </div>
  )
}
