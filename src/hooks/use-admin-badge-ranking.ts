import { useSuspenseQuery } from '@tanstack/react-query'
import { client } from '@/utils/client'

/**
 * 管理画面: バッジ所持数ランキング（ページング対応）
 * limit / offset を変えると新しい queryKey で再フェッチされる
 */
export const useAdminBadgeRanking = (limit: number, offset: number) => {
  return useSuspenseQuery({
    queryKey: ['admin', 'badges', 'ranking', { limit, offset }],
    queryFn: () => client.getAdminBadgeRanking({ queries: { limit, offset } }),
    staleTime: 0
  })
}
