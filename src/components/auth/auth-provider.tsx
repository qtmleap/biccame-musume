import { getRedirectResult, onAuthStateChanged } from 'firebase/auth'
import { useSetAtom } from 'jotai'
import { type ReactNode, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { backendSessionReadyAtom, userAtom } from '@/atoms/auth-atom'
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
  const setBackendSessionReady = useSetAtom(backendSessionReadyAtom)
  const redirectResultChecked = useRef(false)

  useEffect(() => {
    // リダイレクト認証の結果を先に処理（1回のみ）
    const handleRedirectResult = async () => {
      if (redirectResultChecked.current) {
        console.info('Redirect result already checked, skipping')
        return
      }
      redirectResultChecked.current = true

      console.info('Checking redirect result...')
      try {
        const result = await getRedirectResult(auth)
        console.info('Redirect result:', result)
        if (result?.user) {
          console.info('Redirect login success:', result.user.uid)
          toast.success(AUTH_LABELS.loginSuccess)
        } else {
          console.info('No redirect result (normal page load)')
        }
      } catch (error) {
        console.error('Redirect login failed:', error)
        const firebaseError = error as { code?: string; message?: string }
        console.error('Error code:', firebaseError.code)
        console.error('Error message:', firebaseError.message)
        if (firebaseError.code !== 'auth/popup-closed-by-user') {
          toast.error(AUTH_LABELS.loginError)
        }
      }
    }

    handleRedirectResult()

    // 認証状態の監視
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.info('Auth state changed:', user ? `${user.uid} (${user.email})` : 'Not authenticated')

      // Firebase Auth の user は即座に反映する (Login ボタン等の表示切替はこれで動く)。
      // backend session Cookie は非同期で確立するので、 useSuspenseQuery を守るのは
      // backendSessionReadyAtom (BackendSessionGate) 側で行う。
      setUser(user)

      if (user === null) {
        setBackendSessionReady(false)
        return
      }

      try {
        const token = await user.getIdToken()
        console.info('ID token obtained')
        await client.authenticate(undefined, { headers: { Authorization: `Bearer ${token}` } })
        console.info('Backend session established')
        setBackendSessionReady(true)
      } catch (error) {
        console.error('Failed to authenticate with backend:', error)
        setBackendSessionReady(false)
      }
    })

    return () => unsubscribe()
  }, [setUser, setBackendSessionReady])

  return <>{children}</>
}
