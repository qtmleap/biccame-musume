import { useEffect, useState } from 'react'

type AccessUser = {
  email: string
  name?: string
  isAuthenticated: boolean
}

type AccessState = {
  isLoading: boolean
  isAuthenticated: boolean
  user: AccessUser | null
  error: string | null
}

/**
 * Cloudflare Access の /cdn-cgi/access/get-identity レスポンス
 * Cookie は HttpOnly のため、この endpoint 経由でのみ認証状態を取得できる
 */
type AccessIdentity = {
  id?: string
  email?: string
  name?: string
  user_uuid?: string
  amr?: string[]
  iat?: number
  exp?: number
}

const GET_IDENTITY_ENDPOINT = '/cdn-cgi/access/get-identity'

/**
 * Cloudflare Access の認証状態を確認するフック
 * 開発環境では常に認証済みとして扱う
 */
export const useCloudflareAccess = (): AccessState => {
  const [state, setState] = useState<AccessState>({
    isLoading: true,
    isAuthenticated: false,
    user: null,
    error: null
  })

  useEffect(() => {
    if (import.meta.env.DEV) {
      setState({
        isLoading: false,
        isAuthenticated: true,
        user: {
          email: 'dev@localhost',
          isAuthenticated: true
        },
        error: null
      })
      return
    }

    const controller = new AbortController()

    const fetchIdentity = async () => {
      try {
        const response = await fetch(GET_IDENTITY_ENDPOINT, {
          credentials: 'include',
          signal: controller.signal,
          headers: { Accept: 'application/json' }
        })

        if (!response.ok) {
          setState({
            isLoading: false,
            isAuthenticated: false,
            user: null,
            error: null
          })
          return
        }

        const identity = (await response.json()) as AccessIdentity
        if (!identity.email) {
          setState({
            isLoading: false,
            isAuthenticated: false,
            user: null,
            error: 'Invalid identity response'
          })
          return
        }

        setState({
          isLoading: false,
          isAuthenticated: true,
          user: {
            email: identity.email,
            name: identity.name,
            isAuthenticated: true
          },
          error: null
        })
      } catch (error) {
        if (controller.signal.aborted) return
        setState({
          isLoading: false,
          isAuthenticated: false,
          user: null,
          error: error instanceof Error ? error.message : 'Failed to verify access'
        })
      }
    }

    fetchIdentity()

    return () => controller.abort()
  }, [])

  return state
}
