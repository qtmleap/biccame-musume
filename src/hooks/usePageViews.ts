import { useSuspenseQuery } from '@tanstack/react-query'
import { client } from '@/utils/client'

/**
 * ページビュー統計を取得するカスタムフック
 */
export const usePageViews = (path?: string) => {
  return useSuspenseQuery({
    queryKey: ['pageViews', path],
    queryFn: () => client.getPageViews(path ? { queries: { path } } : undefined),
    refetchInterval: 5000, // 5秒ごとに自動更新
    staleTime: 0
  })
}
