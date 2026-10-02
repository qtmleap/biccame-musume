import { useQueryClient } from '@tanstack/react-query'
import { getRedirectResult, onAuthStateChanged } from 'firebase/auth'
import { useSetAtom, useStore } from 'jotai'
import { type ReactNode, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { backendSessionGenerationAtom, backendSessionStateAtom, userAtom } from '@/atoms/auth-atom'
import { useAuth } from '@/hooks/use-auth'
import { auth } from '@/lib/firebase'
import { clearUserQueries } from '@/lib/user-query-keys'
import { AUTH_LABELS } from '@/locales/app.content'

interface AuthProviderProps {
  children: ReactNode
}

/**
 * Firebase Authの認証状態を監視してuserAtomを更新し、
 * 認証済みの場合はバックエンドにユーザー情報を送信するProvider
 * アプリのルートで使用する
 */
export const AuthProvider = ({ children }: AuthProviderProps) => {
  const queryClient = useQueryClient()
  const setUser = useSetAtom(userAtom)
  const store = useStore()
  const { retryBackendSession } = useAuth()
  const setBackendSessionState = useSetAtom(backendSessionStateAtom)
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

    // Ignore stale callbacks after an account replacement or effect cleanup.
    let generation = 0
    // 認証状態の監視
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.info('Auth state changed:', user ? `${user.uid} (${user.email})` : 'Not authenticated')

      const currentGeneration = ++generation
      store.set(backendSessionGenerationAtom, store.get(backendSessionGenerationAtom) + 1)
      setBackendSessionState({ status: user ? 'pending' : 'idle' })
      setUser(user)
      await clearUserQueries(queryClient)
      if (user === null || currentGeneration !== generation) return

      await retryBackendSession()
    })

    return () => {
      generation++
      store.set(backendSessionGenerationAtom, store.get(backendSessionGenerationAtom) + 1)
      unsubscribe()
    }
  }, [queryClient, setUser, setBackendSessionState, store, retryBackendSession])

  return <>{children}</>
}
