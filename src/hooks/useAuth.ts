import { onAuthStateChanged, signInWithPopup, signOut, TwitterAuthProvider } from 'firebase/auth'
import { useAtom } from 'jotai'
import { useCallback, useEffect } from 'react'
import { authLoadingAtom, twitterProfileAtom, userAtom } from '@/atoms/authAtom'
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
 */
export const useAuth = () => {
  const [user, setUser] = useAtom(userAtom)
  const [loading, setLoading] = useAtom(authLoadingAtom)
  const [twitterProfile, setTwitterProfile] = useAtom(twitterProfileAtom)

  /**
   * 認証状態の監視
   */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser)
      setLoading(false)

      // ログアウト時はtwitterProfileをクリア
      if (!firebaseUser) {
        setTwitterProfile(null)
      }
      // ログイン時でtwitterProfileがない場合は基本情報のみ設定
      // screen_nameはloginWithTwitter時に設定される
      else if (!twitterProfile) {
        const twitterData = firebaseUser.providerData.find((provider) => provider.providerId === 'twitter.com')
        if (twitterData) {
          setTwitterProfile({
            displayName: twitterData.displayName,
            photoURL: getLargeTwitterPhoto(twitterData.photoURL) ?? null,
            screenName: null
          })
        }
      }
    })

    return () => unsubscribe()
  }, [setUser, setLoading, setTwitterProfile, twitterProfile])

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
        setTwitterProfile({
          displayName: result.user.displayName,
          photoURL: getLargeTwitterPhoto(result.user.photoURL) ?? null,
          screenName: screenName ?? null
        })
      }
      return result.user
    } catch (error) {
      console.error('Twitter login failed:', error)
      throw error
    }
  }, [setTwitterProfile])

  /**
   * ログアウト
   */
  const logout = useCallback(async () => {
    try {
      await signOut(auth)
      setTwitterProfile(null)
    } catch (error) {
      console.error('Logout failed:', error)
      throw error
    }
  }, [setTwitterProfile])

  return {
    user,
    twitterProfile,
    loading,
    isAuthenticated: !!user,
    loginWithTwitter,
    logout
  }
}
