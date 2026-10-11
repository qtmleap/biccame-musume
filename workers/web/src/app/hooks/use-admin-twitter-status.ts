import { useSuspenseQuery } from '@tanstack/react-query'
import { client } from '@/utils/client'

/**
 * 管理者向け: 投稿用 X アカウントのヘルスチェック
 * ページを開くたびに取得し、認証結果を永続化しない。
 */
export const useAdminTwitterStatus = () => {
  return useSuspenseQuery({
    queryKey: ['admin', 'twitter', 'status'],
    queryFn: () => client.getAdminTwitterStatus(),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    networkMode: 'always',
    meta: { persist: false },
    refetchOnWindowFocus: false
  })
}
