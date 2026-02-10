import { Link } from '@tanstack/react-router'
import { LogIn, User } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'

type LoginButtonProps = {
  /** メニュー内表示用のスタイル */
  variant?: 'default' | 'menu'
}

/**
 * ログインボタンコンポーネント
 * 未ログイン時: Twitterログインボタン表示
 * ログイン時: ユーザーアバター+ドロップダウンメニュー表示
 */
export const LoginButton = ({ variant = 'default' }: LoginButtonProps) => {
  const { isAuthenticated, loginWithTwitter } = useAuth()

  /**
   * ログイン処理
   * エミュレーター環境ではリダイレクトされるため、トースト表示は行わない
   */
  const handleLogin = async () => {
    try {
      const result = await loginWithTwitter()
      // ポップアップでログインした場合のみトースト表示
      if (result) {
        toast.success('ログインしました')
      }
      // リダイレクトの場合は何もしない（ページが切り替わる）
    } catch (error) {
      // ポップアップが閉じられた場合はエラーを表示しない
      if ((error as { code?: string })?.code !== 'auth/popup-closed-by-user') {
        toast.error('ログインに失敗しました')
      }
    }
  }

  // メニュー内スタイル
  if (variant === 'menu') {
    // 未ログイン
    if (!isAuthenticated) {
      return (
        <button
          type='button'
          onClick={handleLogin}
          className='flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-muted w-full'
        >
          <LogIn className='w-6 h-6' />
          ログイン
        </button>
      )
    }

    // ログイン済み - マイページへのリンク
    return (
      <Link
        to='/me'
        className='flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-muted'
      >
        <User className='w-6 h-6' />
        マイページ
      </Link>
    )
  }

  // デフォルトスタイル（ヘッダー用）
  // 未ログイン
  if (!isAuthenticated) {
    return (
      <button
        type='button'
        onClick={handleLogin}
        className='text-sm font-medium transition-all text-muted-foreground hover:text-foreground hover:underline decoration-2 decoration-primary underline-offset-4'
      >
        ログイン
      </button>
    )
  }

  // ログイン済み - マイページへのリンク
  return (
    <Link
      to='/me'
      className='text-sm font-medium transition-all text-muted-foreground hover:text-foreground hover:underline decoration-2 decoration-primary underline-offset-4'
    >
      マイページ
    </Link>
  )
}
