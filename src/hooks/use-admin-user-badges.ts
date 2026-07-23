import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import { client } from '@/utils/client'

const STALE_TIME = 60 * 1000

const buildQueryKey = (uid: string) => ['admin', 'users', uid, 'badges'] as const

/**
 * 管理画面: 特定ユーザーの獲得バッジ一覧
 * 呼び出し元は Dialog の内側（open 時のみマウント）で使うことを前提に、
 * enabled 制御は不要で useSuspenseQuery を採用する
 */
export const useAdminUserBadges = (uid: string) => {
  return useSuspenseQuery({
    queryKey: buildQueryKey(uid),
    queryFn: () => client.getAdminUserBadges({ params: { uid } }),
    staleTime: STALE_TIME
  })
}

/**
 * hover / focus 時にダイアログの中身を先読みするための prefetcher。
 * 実際にダイアログを開いた時のスピナー時間を隠す用途。
 */
export const usePrefetchAdminUserBadges = () => {
  const queryClient = useQueryClient()
  return useCallback(
    (uid: string) => {
      queryClient.prefetchQuery({
        queryKey: buildQueryKey(uid),
        queryFn: () => client.getAdminUserBadges({ params: { uid } }),
        staleTime: STALE_TIME
      })
    },
    [queryClient]
  )
}
