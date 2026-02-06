import { Link } from '@tanstack/react-router'
import { LogIn, User } from 'lucide-react'
import { useState } from 'react'
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
  const { loading, isAuthenticated, loginWithTwitter } = useAuth()
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  /**
   * ログイン処理
   */
  const handleLogin = async () => {
    setIsLoggingIn(true)
    try {
      await loginWithTwitter()
      toast.success('ログインしました')
    } catch {
      toast.error('ログインに失敗しました')
    } finally {
      setIsLoggingIn(false)
    }
  }

  // メニュー内スタイル
  if (variant === 'menu') {
    // 読み込み中
    if (loading) {
      return (
        <div className='flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground'>
          <div className='w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin' />
          読み込み中...
        </div>
      )
    }

    // 未ログイン
    if (!isAuthenticated) {
      return (
        <button
          type='button'
          onClick={handleLogin}
          disabled={isLoggingIn}
          className='flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-muted w-full disabled:opacity-50'
        >
          {isLoggingIn ? (
            <div className='w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin' />
          ) : (
            <LogIn className='w-6 h-6' />
          )}
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
  // 読み込み中
  if (loading) {
    return (
      <span className='text-sm font-medium text-muted-foreground'>
        <div className='w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin' />
      </span>
    )
  }

  // 未ログイン
  if (!isAuthenticated) {
    return (
      <button
        type='button'
        onClick={handleLogin}
        disabled={isLoggingIn}
        className='text-sm font-medium transition-all text-muted-foreground hover:text-foreground hover:underline decoration-2 decoration-primary underline-offset-4 disabled:opacity-50'
      >
        {isLoggingIn ? (
          <div className='w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin inline-block' />
        ) : (
          'ログイン'
        )}
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
