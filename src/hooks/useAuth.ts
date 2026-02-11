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
import { client } from '@/utils/client'

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
 * 認証状態の監視はAuthProviderで行う
 */
export const useAuth = () => {
  const user = useAtomValue(userAtom)

  /**
   * メールアドレスでログイン（開発環境用）
   */
  const loginWithEmail = useCallback(async (email: string, password: string) => {
    try {
      const result = await signInWithEmailAndPassword(auth, email, password)
      console.log('Email login success:', result)

      // DBにユーザー情報を保存
      try {
        await client.upsertUser({
          id: result.user.uid,
          displayName: result.user.displayName || email.split('@')[0],
          photoUrl: null,
          email: result.user.email
        })
      } catch (error) {
        console.error('Failed to save user:', error)
      }

      return result.user
    } catch (error) {
      console.error('Email login failed:', error)
      throw error
    }
  }, [])

  /**
   * メールアドレスでユーザー登録（開発環境用）
   */
  const registerWithEmail = useCallback(async (email: string, password: string, displayName?: string) => {
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password)
      console.log('Email registration success:', result)

      // DBにユーザー情報を保存
      try {
        await client.upsertUser({
          id: result.user.uid,
          displayName: displayName || email.split('@')[0],
          photoUrl: null,
          email: result.user.email
        })
      } catch (error) {
        console.error('Failed to save user:', error)
      }

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
        // Twitter認証情報からscreen_nameを取得
        result.user
        const credential = TwitterAuthProvider.credentialFromResult(result)
        if (credential) {
          // @ts-expect-error - TwitterAuthProviderのcredentialにはscreen_nameが含まれる
          const screenName = result._tokenResponse?.screenName as string | undefined
          const photoUrl = getLargeTwitterPhoto(result.user.photoURL) ?? null

          // DBにユーザー情報を保存（screenNameを含む）
          try {
            await client.upsertUser({
              id: result.user.uid,
              displayName: result.user.displayName,
              photoUrl,
              screenName: screenName,
              email: result.user.email
            })
          } catch (error) {
            console.error('Failed to save user:', error)
          }
        }
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
    isAuthenticated: !!user,
    loginWithTwitter,
    loginWithEmail,
    registerWithEmail,
    logout
  }
}
