import { Skeleton } from '@/components/ui/skeleton'

/**
 * 共通ローディングフォールバック
 */
export const LoadingFallback = () => (
  <div className='min-h-screen'>
    <div className='mx-auto px-4 py-4 md:py-6 md:px-8 max-w-6xl space-y-4'>
      <Skeleton className='h-8 w-48' />
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
        <Skeleton className='h-40 rounded-lg' />
        <Skeleton className='h-40 rounded-lg' />
        <Skeleton className='h-40 rounded-lg' />
        <Skeleton className='h-40 rounded-lg' />
      </div>
    </div>
  </div>
)
