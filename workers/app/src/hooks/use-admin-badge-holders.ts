import { useSuspenseQuery } from '@tanstack/react-query'
import { client } from '@/utils/client'

/**
 * 管理者向け: 指定バッジの獲得者一覧（uid / displayName / thumbnail / earnedAt）を取得。
 * Cloudflare Access で守られた /api/admin/badges/:code/holders を叩く。
 */
export const useAdminBadgeHolders = (code: string) => {
  return useSuspenseQuery({
    queryKey: ['badges', 'admin', code, 'holders'],
    queryFn: () => client.getAdminBadgeHolders({ params: { code } }),
    staleTime: 60 * 1000
  })
}
