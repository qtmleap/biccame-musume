import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'

/** 絞り込みバーの 1 項目。ラベルは上に置き、入力の高さは呼び出し側で揃える */
export const FilterField = ({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) => (
  <div className='flex min-w-0 flex-col gap-1.5'>
    <Label htmlFor={htmlFor} className='text-xs font-medium text-muted-foreground'>
      {label}
    </Label>
    {children}
  </div>
)
