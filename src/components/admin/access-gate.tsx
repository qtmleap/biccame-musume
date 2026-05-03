import { LogIn, ShieldAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Button } from '@/components/ui/button'
import { useCloudflareAccess } from '@/hooks/use-cloudflare-access'

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
    // 未認証の場合は edge の Cloudflare Access にリダイレクトさせる
    // 正しく Access が設定されていれば、reload で edge がログイン画面へ飛ばす
    const handleLogin = () => {
      window.location.reload()
    }

    return (
      <div className='container mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4'>
        <div className='w-full rounded-2xl border border-border/60 bg-card p-8 text-center shadow-md'>
          <div className='mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30'>
            <ShieldAlert className='size-8 animate-pulse text-amber-600 dark:text-amber-400' />
          </div>
          <h1 className='mb-2 text-xl font-bold text-foreground'>認証が必要です</h1>
          <p className='mb-6 text-sm text-muted-foreground'>
            このページにアクセスするには管理者権限が必要です。
            {error && <span className='mt-2 block text-destructive'>{error}</span>}
          </p>
          <Button onClick={handleLogin} aria-label='Cloudflare Access でログイン' className='w-full'>
            <LogIn className='size-4' />
            ログイン
          </Button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
