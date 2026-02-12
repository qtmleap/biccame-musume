import { Link, useRouter } from '@tanstack/react-router'
import { AlertCircle, Home, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

type ErrorFallbackProps = {
  error: Error
  reset?: () => void
}

/**
 * エラーフォールバックコンポーネント
 * ErrorBoundaryで使用される
 */
export const ErrorFallback = ({ error, reset }: ErrorFallbackProps) => {
  const router = useRouter()

  const handleReset = () => {
    if (reset) {
      reset()
    } else {
      router.invalidate()
    }
  }

  return (
    <div className='min-h-[60vh] flex items-center justify-center px-4'>
      <div className='max-w-2xl mx-auto text-center space-y-6'>
        {/* エラーアイコン */}
        <div className='flex justify-center'>
          <AlertCircle className='size-16 text-red-500' />
        </div>

        {/* エラーメッセージ */}
        <div>
          <h1 className='text-3xl font-bold text-gray-800 mb-4'>エラーが発生しました</h1>
          <p className='text-gray-600 text-lg mb-2'>申し訳ございません。予期しないエラーが発生しました。</p>
          {import.meta.env.DEV && (
            <div className='mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-left'>
              <p className='text-sm font-mono text-red-800 break-all'>{error.message}</p>
            </div>
          )}
        </div>

        {/* アクション */}
        <div className='flex flex-col sm:flex-row gap-4 justify-center items-center pt-4'>
          <Button onClick={handleReset} size='lg' className='bg-[#e50012] hover:bg-[#c4000f]'>
            <RefreshCw className='mr-2 size-5' />
            再読み込み
          </Button>
          <Button asChild variant='outline' size='lg'>
            <Link to='/'>
              <Home className='mr-2 size-5' />
              トップページに戻る
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
