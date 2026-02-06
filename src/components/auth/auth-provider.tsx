import { onAuthStateChanged } from 'firebase/auth'
import { useSetAtom } from 'jotai'
import { type ReactNode, useEffect } from 'react'
import { authLoadingAtom, twitterProfileAtom, userAtom } from '@/atoms/authAtom'
import { getLargeTwitterPhoto } from '@/hooks/useAuth'
import { auth } from '@/lib/firebase'

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
  const setTwitterProfile = useSetAtom(twitterProfileAtom)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser)
      setLoading(false)

      if (!firebaseUser) {
        setTwitterProfile(null)
      } else {
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
  }, [setUser, setLoading, setTwitterProfile])

  return <>{children}</>
}
