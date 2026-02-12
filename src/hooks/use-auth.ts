import {
  createUserWithEmailAndPassword,
  GithubAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  TwitterAuthProvider
} from 'firebase/auth'
import { useAtomValue } from 'jotai'
import { useCallback } from 'react'
import { userAtom } from '@/atoms/auth-atom'
import { auth } from '@/lib/firebase'

/**
 * Twitterのプロフィール画像URLを大きいサイズに変換
 * _normal (48x48) → _400x400 (400x400)
 */
export const getLargeTwitterPhoto = (photoURL: string | null | undefined): string | undefined => {
  if (!photoURL) return undefined
  return photoURL.replace('_normal', '_400x400')
}

/**
 * Firebase Authentication用カスタムフック
 * 複数のログイン方法を提供：Twitter、Google、GitHub、Apple、メール/パスワード
 * 認証状態の監視とアカウント作成はAuthProviderで行う
 */
export const useAuth = () => {
  const user = useAtomValue(userAtom)

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
   * Twitterでログイン
   */
  const loginWithTwitter = useCallback(async () => {
    const provider = new TwitterAuthProvider()
    try {
      const result = await signInWithPopup(auth, provider)
      return result.user
    } catch (error) {
      console.error('Twitter login failed:', error)
      if ((error as { code?: string })?.code !== 'auth/popup-closed-by-user') {
        throw error
      }
    }
  }, [])

  /**
   * Googleでログイン
   */
  const loginWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider()
    try {
      const result = await signInWithPopup(auth, provider)
      return result.user
    } catch (error) {
      console.error('Google login failed:', error)
      if ((error as { code?: string })?.code !== 'auth/popup-closed-by-user') {
        throw error
      }
    }
  }, [])

  /**
   * GitHubでログイン
   */
  const loginWithGithub = useCallback(async () => {
    const provider = new GithubAuthProvider()
    try {
      const result = await signInWithPopup(auth, provider)
      return result.user
    } catch (error) {
      console.error('GitHub login failed:', error)
      if ((error as { code?: string })?.code !== 'auth/popup-closed-by-user') {
        throw error
      }
    }
  }, [])

  /**
   * Appleでログイン
   */
  const loginWithApple = useCallback(async () => {
    const provider = new OAuthProvider('apple.com')
    try {
      const result = await signInWithPopup(auth, provider)
      return result.user
    } catch (error) {
      console.error('Apple login failed:', error)
      if ((error as { code?: string })?.code !== 'auth/popup-closed-by-user') {
        throw error
      }
    }
  }, [])

  /**
   * ログアウト
   * ログアウト後はトップページに遷移する
   */
  const logout = useCallback(async () => {
    try {
      await signOut(auth)
      window.location.href = '/'
    } catch (error) {
      console.error('Logout failed:', error)
      throw error
    }
  }, [])

  return {
    user,
    // Firebase Authの認証状態（userAtom）でログイン判定
    isAuthenticated: !!user,
    loginWithTwitter,
    loginWithGoogle,
    loginWithGithub,
    loginWithApple,
    loginWithEmail,
    registerWithEmail,
    logout
  }
}
