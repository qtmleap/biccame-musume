import { useQueryClient } from '@tanstack/react-query'
import {
  createUserWithEmailAndPassword,
  GithubAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithEmailAndPassword,
  signInWithRedirect,
  signOut,
  TwitterAuthProvider
} from 'firebase/auth'
import { useAtomValue, useSetAtom, useStore } from 'jotai'
import { useCallback } from 'react'
import {
  backendSessionGenerationAtom,
  backendSessionReadyAtom,
  backendSessionStateAtom,
  userAtom
} from '@/atoms/auth-atom'
import { establishBackendSession, serializeSessionOperation } from '@/lib/auth-session'
import { auth } from '@/lib/firebase'
import { clearUserQueries, deserializePublicQueryCache } from '@/lib/user-query-keys'
import { client } from '@/utils/client'

/**
 * Firebase Authentication用カスタムフック
 * 複数のログイン方法を提供：Twitter、Google、GitHub、Apple、メール/パスワード
 * 認証状態の監視とアカウント作成はAuthProviderで行う
 */
export const useAuth = () => {
  const user = useAtomValue(userAtom)
  const queryClient = useQueryClient()
  const store = useStore()
  const setBackendSessionState = useSetAtom(backendSessionStateAtom)
  const backendSessionState = useAtomValue(backendSessionStateAtom)
  const backendSessionReady = useAtomValue(backendSessionReadyAtom)

  const retryBackendSession = useCallback(async () => {
    const currentUser = store.get(userAtom)
    if (!currentUser || auth.currentUser?.uid !== currentUser.uid) return
    const generation = store.get(backendSessionGenerationAtom) + 1
    store.set(backendSessionGenerationAtom, generation)
    store.set(backendSessionStateAtom, { status: 'pending' })
    const isCurrent = () =>
      store.get(backendSessionGenerationAtom) === generation &&
      store.get(userAtom)?.uid === currentUser.uid &&
      auth.currentUser?.uid === currentUser.uid
    try {
      await establishBackendSession()
      if (isCurrent()) store.set(backendSessionStateAtom, { status: 'ready', uid: currentUser.uid })
    } catch (error) {
      console.error('Failed to authenticate with backend:', error)
      if (isCurrent())
        store.set(backendSessionStateAtom, {
          status: 'error',
          message: '認証に失敗しました。時間をおいて再試行してください。'
        })
    }
  }, [store])

  /**
   * メールアドレスでログイン（開発環境用）
   * ログイン成功時のユーザー情報送信はAuthProviderで自動実行される
   */
  const loginWithEmail = useCallback(async (email: string, password: string) => {
    try {
      const result = await signInWithEmailAndPassword(auth, email, password)
      console.log('Email login success:', result)
      return result.user
    } catch (error) {
      console.error('Email login failed:', error)
      throw error
    }
  }, [])

  /**
   * メールアドレスでユーザー登録（開発環境用）
   * アカウント作成後のユーザー情報送信はAuthProviderで自動実行される
   */
  const registerWithEmail = useCallback(async (email: string, password: string, displayName?: string) => {
    try {
      displayName
      const result = await createUserWithEmailAndPassword(auth, email, password)
      console.log('Email registration success:', result)
      return result.user
    } catch (error) {
      console.error('Email registration failed:', error)
      throw error
    }
  }, [])

  /**
   * Twitterでログイン（リダイレクト方式）
   */
  const loginWithTwitter = useCallback(async () => {
    const provider = new TwitterAuthProvider()
    await signInWithRedirect(auth, provider)
  }, [])

  /**
   * Googleでログイン（リダイレクト方式）
   */
  const loginWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider()
    await signInWithRedirect(auth, provider)
  }, [])

  /**
   * GitHubでログイン（リダイレクト方式）
   */
  const loginWithGithub = useCallback(async () => {
    const provider = new GithubAuthProvider()
    await signInWithRedirect(auth, provider)
  }, [])

  /**
   * Appleでログイン（リダイレクト方式）
   */
  const loginWithApple = useCallback(async () => {
    const provider = new OAuthProvider('apple.com')
    await signInWithRedirect(auth, provider)
  }, [])

  /**
   * ログアウト
   * ログアウト後はトップページに遷移する
   */
  const logout = useCallback(async () => {
    try {
      await serializeSessionOperation(async () => {
        const response = await client.logout(undefined)
        if (!response.success) throw new Error('セッションを失効できませんでした')
        await signOut(auth)
      })
      setBackendSessionState({ status: 'idle' })
      await clearUserQueries(queryClient)
      const stored = localStorage.getItem('REACT_QUERY_OFFLINE_CACHE')
      if (stored) {
        try {
          localStorage.setItem('REACT_QUERY_OFFLINE_CACHE', JSON.stringify(deserializePublicQueryCache(stored)))
        } catch {
          localStorage.removeItem('REACT_QUERY_OFFLINE_CACHE')
        }
      }
      window.location.href = '/'
    } catch (error) {
      console.error('Logout failed:', error)
      throw error
    }
  }, [queryClient, setBackendSessionState])

  return {
    user,
    // Firebase Auth 完了 かつ バックエンド session Cookie 確立済みで初めて認証扱い。
    // これで Cookie 認証が必要な useSuspenseQuery が 401 を踏まないようにする。
    isAuthenticated: !!user && backendSessionReady,
    // Firebase Auth 単体の完了状態 (backend session の有無は問わない)
    isFirebaseAuthenticated: !!user,
    backendSessionReady,
    backendSessionState,
    retryBackendSession,
    loginWithTwitter,
    loginWithGoogle,
    loginWithGithub,
    loginWithApple,
    loginWithEmail,
    registerWithEmail,
    logout
  }
}
