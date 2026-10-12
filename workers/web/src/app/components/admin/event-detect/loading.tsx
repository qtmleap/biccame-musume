import { Skeleton } from '@/components/ui/skeleton'

/** 一覧の再読み込み中に出す枠。絞り込みバーは残したまま結果だけを差し替える */
export const ListSkeleton = () => (
  <div className='space-y-3' aria-busy='true'>
    <Skeleton className='h-5 w-40' />
    <Skeleton className='h-32 w-full' />
    <Skeleton className='h-32 w-full' />
  </div>
)
