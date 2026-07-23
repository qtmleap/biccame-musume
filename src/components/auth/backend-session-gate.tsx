import { useAtomValue } from 'jotai'
import type { ReactNode } from 'react'
import { backendSessionReadyAtom, userAtom } from '@/atoms/auth-atom'
import { LoadingFallback } from '@/components/common/loading-fallback'

interface BackendSessionGateProps {
  children: ReactNode
}

/**
 * Cookie 認証が必要な画面で、 バックエンド session Cookie が確立するまで
 * 子要素の描画をブロックするゲート。
 *
 * useSuspenseQuery は enabled オプションを持たないため、 Firebase Auth 完了直後に
 * 401 を踏まないよう「Cookie が入るまで render しない」制御をここで行う。
 * 呼び出し側は既に Firebase 認証済みであることを確認済みという前提 (route beforeLoad)。
 */
export const BackendSessionGate = ({ children }: BackendSessionGateProps) => {
  const user = useAtomValue(userAtom)
  const backendSessionReady = useAtomValue(backendSessionReadyAtom)

  if (user === null || !backendSessionReady) {
    return <LoadingFallback />
  }

  return <>{children}</>
}
