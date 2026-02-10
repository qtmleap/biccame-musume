import { getRedirectResult, onAuthStateChanged, TwitterAuthProvider } from 'firebase/auth'
import { useSetAtom } from 'jotai'
import { type ReactNode, useEffect } from 'react'
import { userAtom } from '@/atoms/authAtom'
import { getLargeTwitterPhoto } from '@/hooks/useAuth'
import { auth } from '@/lib/firebase'
import { client } from '@/utils/client'

type AuthProviderProps = {
  children: ReactNode
}

/**
 * 認証状態を監視してatomを更新するProvider
 * アプリのルートで使用する
 */
export const AuthProvider = ({ children }: AuthProviderProps) => {
  const setUser = useSetAtom(userAtom)

  // リダイレクト結果を処理（エミュレーター用）
  useEffect(() => {
    const handleRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth)
        if (result) {
          console.debug('Redirect login success:', result)
          // Twitter認証情報からscreen_nameを取得
          const credential = TwitterAuthProvider.credentialFromResult(result)
          if (credential) {
            // @ts-expect-error - TwitterAuthProviderのcredentialにはscreen_nameが含まれる
            const screenName = result._tokenResponse?.screenName as string | undefined
            const photoUrl = getLargeTwitterPhoto(result.user.photoURL) ?? null

            // DBにユーザー情報を保存
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
        }
      } catch (error) {
        console.error('Redirect login error:', error)
      }
    }

    if (import.meta.env.DEV) {
      handleRedirectResult()
    }
  }, [])

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)

      if (firebaseUser) {
        const twitterData = firebaseUser.providerData.find((provider) => provider.providerId === 'twitter.com')
        if (twitterData) {
          const photoUrl = getLargeTwitterPhoto(twitterData.photoURL) ?? null

          // DBにユーザー情報を保存
          try {
            await client.upsertUser({
              id: firebaseUser.uid,
              displayName: twitterData.displayName,
              photoUrl,
              email: firebaseUser.email
            })
          } catch (error) {
            console.error('Failed to save user:', error)
          }
        }
      }
    })

    return () => unsubscribe()
  }, [setUser])

  return <>{children}</>
}
