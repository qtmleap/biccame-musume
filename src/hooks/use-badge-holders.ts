import { useQuery } from '@tanstack/react-query'
import { client } from '@/utils/client'

/**
 * 指定バッジの獲得者一覧を取得。 Dialog を開いたときに enable することで
 * 初期表示時の不要なリクエストを避ける。
 */
export const useBadgeHolders = (code: string, enabled: boolean) => {
  return useQuery({
    queryKey: ['badges', code, 'holders'],
    queryFn: () => client.getBadgeHolders({ params: { code } }),
    enabled,
    staleTime: 60 * 1000
  })
}
