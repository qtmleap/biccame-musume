import { getRedirectResult, onAuthStateChanged } from 'firebase/auth'
import { useSetAtom } from 'jotai'
import { type ReactNode, useEffect } from 'react'
import { toast } from 'sonner'
import { userAtom } from '@/atoms/auth-atom'
import { auth } from '@/lib/firebase'
import { AUTH_LABELS } from '@/locales/app.content'
import { client } from '@/utils/client'

interface AuthProviderProps {
  children: ReactNode
}

/**
 * Firebase Authの認証状態を監視してuserAtomを更新し、
 * 認証済みの場合はバックエンドにユーザー情報を送信するProvider
 * アプリのルートで使用する
 */
export const AuthProvider = ({ children }: AuthProviderProps) => {
  const setUser = useSetAtom(userAtom)

  // リダイレクト認証の結果を処理
  useEffect(() => {
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          console.info('Redirect login success:', result.user.uid)
          toast.success(AUTH_LABELS.loginSuccess)
        }
      })
      .catch((error) => {
        console.error('Redirect login failed:', error)
        if (error.code !== 'auth/popup-closed-by-user') {
          toast.error(AUTH_LABELS.loginError)
        }
      })
  }, [])

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.info('Auth state changed:', user ? `${user.uid} (${user.email})` : 'Not authenticated')

      // userAtomを更新してログイン状態を反映
      setUser(user)

      if (user) {
        // 認証済みの場合はIDトークンを取得してバックエンドに送信
        try {
          const token = await user.getIdToken()
          console.info('ID token obtained')

          // バックエンドにユーザー情報を送信（アカウント作成・更新を一任）
          await client.authenticate(undefined, { headers: { Authorization: `Bearer ${token}` } })
        } catch (error) {
          console.error('Failed to authenticate with backend:', error)
        }
      }
    })

    return () => unsubscribe()
  }, [setUser])

  return <>{children}</>
}
