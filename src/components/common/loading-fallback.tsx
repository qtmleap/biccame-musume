import { Loader2 } from 'lucide-react'
import { COMMON_LABELS } from '@/locales/app.content'

/**
 * 共通ローディングフォールバック
 */
export const LoadingFallback = () => (
  <div className='min-h-screen flex items-center justify-center'>
    <div className='text-center'>
      <Loader2 className='h-12 w-12 animate-spin text-red-600 mx-auto mb-4' />
      <p className='text-muted-foreground'>{COMMON_LABELS.loading}</p>
    </div>
  </div>
)
