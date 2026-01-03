import { LogIn, ShieldAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Button } from '@/components/ui/button'
import { useCloudflareAccess } from '@/hooks/useCloudflareAccess'

type AccessGateProps = {
  children: ReactNode
}

/**
 * Cloudflare Access認証が必要なページのゲートコンポーネント
 * 認証されていない場合はCloudflare Accessのログインページへリダイレクト
 */
export const AccessGate = ({ children }: AccessGateProps) => {
  const { isLoading, isAuthenticated, error } = useCloudflareAccess()

  if (isLoading) {
    return <LoadingFallback />
  }

  if (!isAuthenticated) {
    const handleLogin = () => {
      // 現在のページへリダイレクトするためのURL
      // Cloudflare Accessは認証後に元のURLにリダイレクトする
      window.location.reload()
    }

    return (
      <div className='container mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4'>
        <div className='w-full rounded-lg border bg-white p-8 text-center shadow-sm'>
          <div className='mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-amber-100'>
            <ShieldAlert className='size-8 text-amber-600' />
          </div>
          <h1 className='mb-2 text-xl font-bold text-gray-900'>認証が必要です</h1>
          <p className='mb-6 text-sm text-gray-600'>
            このページにアクセスするには管理者権限が必要です。
            {error && <span className='mt-2 block text-red-500'>{error}</span>}
          </p>
          <Button onClick={handleLogin} className='w-full gap-2'>
            <LogIn className='size-4' />
            ログイン
          </Button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
