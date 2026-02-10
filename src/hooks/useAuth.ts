import { signInWithPopup, signInWithRedirect, signOut, TwitterAuthProvider } from 'firebase/auth'
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
   * Twitterでログイン
   * エミュレーター環境ではリダイレクト、本番環境ではポップアップを使用
   */
  const loginWithTwitter = useCallback(async () => {
    const provider = new TwitterAuthProvider()
    const isEmulator = import.meta.env.DEV

    try {
      if (isEmulator) {
        // エミュレーターではリダイレクトを使用
        await signInWithRedirect(auth, provider)
        // リダイレクト後の処理はAuthProviderで行われる
      } else {
        // 本番環境ではポップアップを使用
        const result = await signInWithPopup(auth, provider)
        console.log(result)
        // Twitter認証情報からscreen_nameを取得
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
    logout
  }
}
