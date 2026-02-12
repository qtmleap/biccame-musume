import { Link } from '@tanstack/react-router'
import { LogIn, User } from 'lucide-react'
import { useState } from 'react'
import { LoginDialog } from '@/components/auth/login-dialog'
import { useAuth } from '@/hooks/use-auth'

type LoginButtonProps = {
  /** メニュー内表示用のスタイル */
  variant?: 'default' | 'menu'
}

/**
 * ログインボタンコンポーネント
 * 未ログイン時: Twitterログインボタン表示
 * ログイン時: ユーザーアバター+ドロップダウンメニュー表示
 * 本番環境以外では非表示
 */
export const LoginButton = ({ variant = 'default' }: LoginButtonProps) => {
  const { isAuthenticated } = useAuth()
  const [dialogOpen, setDialogOpen] = useState(false)

  // 本番環境以外では非表示
  if (!import.meta.env.PROD) {
    return null
  }

  /**
   * ログインダイアログを開く
   */
  const handleLogin = () => {
    setDialogOpen(true)
  }

  // メニュー内スタイル
  if (variant === 'menu') {
    // 未ログイン
    if (!isAuthenticated) {
      return (
        <>
          <button
            type='button'
            onClick={handleLogin}
            className='flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-muted w-full'
          >
            <LogIn className='w-6 h-6' />
            ログイン
          </button>
          <LoginDialog open={dialogOpen} onOpenChange={setDialogOpen} />
        </>
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
      <>
        <button
          type='button'
          onClick={handleLogin}
          className='text-sm font-medium transition-all text-muted-foreground hover:text-foreground hover:underline decoration-2 decoration-primary underline-offset-4'
        >
          ログイン
        </button>
        <LoginDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      </>
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
