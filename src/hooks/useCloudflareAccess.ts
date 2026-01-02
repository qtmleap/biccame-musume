import { useEffect, useState } from 'react'

type AccessUser = {
  email: string
  isAuthenticated: boolean
}

type AccessState = {
  isLoading: boolean
  isAuthenticated: boolean
  user: AccessUser | null
  error: string | null
}

/**
 * Cloudflare Accessの認証状態を確認するフック
 * CF_Authorizationクッキーの存在をチェックする
 */
export const useCloudflareAccess = (): AccessState => {
  const [state, setState] = useState<AccessState>({
    isLoading: true,
    isAuthenticated: false,
    user: null,
    error: null
  })

  useEffect(() => {
    const checkAccess = () => {
      try {
        // CF_Authorization クッキーが存在するか確認
        const cookies = document.cookie.split(';')
        const accessCookie = cookies.find((c) => c.trim().startsWith('CF_Authorization='))

        if (!accessCookie) {
          setState({
            isLoading: false,
            isAuthenticated: false,
            user: null,
            error: null
          })
          return
        }

        const token = accessCookie.split('=')[1]

        // JWTのペイロードをデコード（署名検証はサーバー側で行う）
        const parts = token.split('.')
        if (parts.length !== 3) {
          setState({
            isLoading: false,
            isAuthenticated: false,
            user: null,
            error: 'Invalid token format'
          })
          return
        }

        const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
        const payload = JSON.parse(atob(payloadB64))

        // 有効期限チェック
        const now = Math.floor(Date.now() / 1000)
        if (payload.exp < now) {
          setState({
            isLoading: false,
            isAuthenticated: false,
            user: null,
            error: 'Token expired'
          })
          return
        }

        setState({
          isLoading: false,
          isAuthenticated: true,
          user: {
            email: payload.email,
            isAuthenticated: true
          },
          error: null
        })
      } catch (error) {
        console.error('Access check failed:', error)
        setState({
          isLoading: false,
          isAuthenticated: false,
          user: null,
          error: 'Failed to verify access'
        })
      }
    }

    checkAccess()
  }, [])

  return state
}
