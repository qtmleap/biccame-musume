import { useLocation } from '@tanstack/react-router'
import { useEffect } from 'react'
import { client } from '@/utils/client'

/**
 * ページビュートラッキング用フック
 * ページマウント時に1回だけトラッキングAPIを呼び出す
 */
export const useTrackPageView = () => {
  const location = useLocation()

  useEffect(() => {
    const trackView = async () => {
      try {
        await client.trackPageView(undefined, {
          queries: {
            path: location.pathname
          }
        })
      } catch (error) {
        console.error('[PageView] Failed to track:', error)
      }
    }

    trackView()
  }, [location.pathname])
}
