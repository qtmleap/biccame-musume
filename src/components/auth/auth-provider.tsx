import { onIdTokenChanged } from 'firebase/auth'
import { type ReactNode, useEffect } from 'react'
import { auth } from '@/lib/firebase'
import { client } from '@/utils/client'

interface AuthProviderProps {
  children: ReactNode
}

/**
 * 認証状態を監視してatomを更新するProvider
 * アプリのルートで使用する
 */
export const AuthProvider = ({ children }: AuthProviderProps) => {
  useEffect(() => {
    onIdTokenChanged(auth, async (user) => {
      console.info('OnIdTokenChanged:', user)
      if (user) {
        const token = await user.getIdToken()
        console.info('Token:', token)
        await client.authenticate(undefined, { headers: { Authorization: `Bearer ${token}` } })
      }
    })
  })

  return <>{children}</>
}
