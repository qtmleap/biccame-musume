import { useSuspenseQueries } from '@tanstack/react-query'
import { client } from '@/utils/client'

export const useBadges = () => {
  const [badgesQuery, myBadgesQuery] = useSuspenseQueries({
    queries: [
      {
        queryKey: ['badges'],
        queryFn: () => client.getBadges(),
        staleTime: 5 * 60 * 1000,
        // QueryClient のグローバル設定が refetchOnMount: false なので、
        // localStorage キャッシュが効いて /badges を開いても再フェッチされない問題を回避
        refetchOnMount: 'always' as const
      },
      {
        queryKey: ['me', 'badges'],
        queryFn: () => client.getMyBadges(),
        refetchOnMount: 'always' as const
      }
    ]
  })

  const earnedMap = new Map(myBadgesQuery.data.earned.map((e) => [e.code, e.earnedAt]))

  return {
    badges: badgesQuery.data.badges,
    earnedMap
  }
}
