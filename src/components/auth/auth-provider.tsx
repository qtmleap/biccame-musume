import { onAuthStateChanged } from 'firebase/auth'
import { useAtomValue, useSetAtom } from 'jotai'
import { type ReactNode, useEffect } from 'react'
import { authLoadingAtom, twitterProfileAtom, userAtom } from '@/atoms/authAtom'
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
  const setLoading = useSetAtom(authLoadingAtom)
  const currentTwitterProfile = useAtomValue(twitterProfileAtom)
  const setTwitterProfile = useSetAtom(twitterProfileAtom)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)
      setLoading(false)

      if (!firebaseUser) {
        setTwitterProfile(null)
      } else {
        const twitterData = firebaseUser.providerData.find((provider) => provider.providerId === 'twitter.com')
        if (twitterData) {
          const photoUrl = getLargeTwitterPhoto(twitterData.photoURL) ?? null
          // 既存のscreenNameを保持（loginWithTwitter時に設定される）
          setTwitterProfile({
            displayName: twitterData.displayName,
            photoURL: photoUrl,
            screenName: currentTwitterProfile?.screenName ?? null
          })

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
  }, [setUser, setLoading, setTwitterProfile, currentTwitterProfile?.screenName])

  return <>{children}</>
}
