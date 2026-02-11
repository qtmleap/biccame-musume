import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  TwitterAuthProvider
} from 'firebase/auth'
import { useAtomValue } from 'jotai'
import { useCallback } from 'react'
import { userAtom } from '@/atoms/authAtom'
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
 * Twitterログイン/ログアウト機能を提供
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
   * 開発環境ではメール認証を使用
   * 本番環境ではTwitter認証を使用
   */
  const loginWithTwitter = useCallback(async () => {
    const isEmulator = import.meta.env.DEV
    const provider: TwitterAuthProvider = new TwitterAuthProvider()

    console.log('loginWithTwitter called, isEmulator:', isEmulator)

    try {
      if (isEmulator) {
        // 開発環境ではメール認証を使用するよう案内
        throw new Error('開発環境ではメール/パスワード認証を使用してください')
      } else {
        // 本番環境ではポップアップを使用
        console.log('Attempting signInWithPopup...')
        const result = await signInWithPopup(auth, provider)
        console.log('signInWithPopup completed', result)
        // Twitter認証後のユーザー情報送信はAuthProviderで自動実行される
        return result.user
      }
    } catch (error) {
      console.error('Twitter login failed:', error)
      // ポップアップが閉じられた場合はエラーを表示しない
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
    loginWithEmail,
    registerWithEmail,
    logout
  }
}
