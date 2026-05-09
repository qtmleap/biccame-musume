import { useSuspenseQuery } from '@tanstack/react-query'
import { client } from '@/utils/client'

/**
 * 管理者向け: 投稿用 X アカウントのヘルスチェック
 * X 側のレート制限を踏まないよう staleTime は長めに、refetch は明示操作のみ。
 */
export const useAdminTwitterStatus = () => {
  return useSuspenseQuery({
    queryKey: ['admin', 'twitter', 'status'],
    queryFn: () => client.getAdminTwitterStatus(),
    staleTime: 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false
  })
}
