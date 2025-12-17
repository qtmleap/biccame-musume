/**
 * 共通ローディングフォールバック
 */
export const LoadingFallback = () => (
  <div className='min-h-screen flex items-center justify-center'>
    <div className='text-center'>
      <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4' />
      <p className='text-muted-foreground'>読み込み中...</p>
    </div>
  </div>
)
