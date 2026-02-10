import { signInWithPopup, signOut, TwitterAuthProvider } from 'firebase/auth'
import { useAtomValue, useSetAtom } from 'jotai'
import { useCallback } from 'react'
import { authLoadingAtom, loggingOutAtom, twitterProfileAtom, userAtom } from '@/atoms/authAtom'
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
  const loading = useAtomValue(authLoadingAtom)
  const loggingOut = useAtomValue(loggingOutAtom)
  const twitterProfile = useAtomValue(twitterProfileAtom)
  const setTwitterProfile = useSetAtom(twitterProfileAtom)
  const setLoggingOut = useSetAtom(loggingOutAtom)

  /**
   * Twitterでログイン
   */
  const loginWithTwitter = useCallback(async () => {
    const provider = new TwitterAuthProvider()
    try {
      const result = await signInWithPopup(auth, provider)
      // Twitter認証情報からscreen_nameを取得
      const credential = TwitterAuthProvider.credentialFromResult(result)
      if (credential) {
        // @ts-expect-error - TwitterAuthProviderのcredentialにはscreen_nameが含まれる
        const screenName = result._tokenResponse?.screenName as string | undefined
        const photoUrl = getLargeTwitterPhoto(result.user.photoURL) ?? null
        setTwitterProfile({
          displayName: result.user.displayName,
          photoURL: photoUrl,
          screenName: screenName ?? null
        })

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
    } catch (error) {
      console.error('Twitter login failed:', error)
      throw error
    }
  }, [setTwitterProfile])

  /**
   * ログアウト
   * ログアウト後はトップページに遷移する
   */
  const logout = useCallback(async () => {
    try {
      setLoggingOut(true)
      await signOut(auth)
      setTwitterProfile(null)
      window.location.href = '/'
    } catch (error) {
      setLoggingOut(false)
      console.error('Logout failed:', error)
      throw error
    }
  }, [setTwitterProfile, setLoggingOut])

  return {
    user,
    twitterProfile,
    loading,
    loggingOut,
    isAuthenticated: !!user,
    loginWithTwitter,
    logout
  }
}
