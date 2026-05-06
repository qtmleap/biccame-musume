import { useSuspenseQueries } from '@tanstack/react-query'
import { client } from '@/utils/client'

export const useBadges = () => {
  const [badgesQuery, myBadgesQuery] = useSuspenseQueries({
    queries: [
      {
        queryKey: ['badges'],
        queryFn: () => client.getBadges(),
        staleTime: 5 * 60 * 1000
      },
      {
        queryKey: ['me', 'badges'],
        queryFn: () => client.getMyBadges()
      }
    ]
  })

  const earnedMap = new Map(myBadgesQuery.data.earned.map((e) => [e.code, e.earnedAt]))

  return {
    badges: badgesQuery.data.badges,
    earnedMap
  }
}
