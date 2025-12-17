import { Loader2 } from 'lucide-react'

/**
 * 共通ローディングフォールバック
 */
export const LoadingFallback = () => (
  <div className='min-h-screen flex items-center justify-center'>
    <div className='text-center'>
      <Loader2 className='h-12 w-12 animate-spin text-primary mx-auto mb-4' />
      <p className='text-muted-foreground'>読み込み中...</p>
    </div>
  </div>
)
