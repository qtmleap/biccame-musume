import { useSuspenseQuery } from '@tanstack/react-query'
import { client } from '@/utils/client'

export const useBadgeLeaderboard = (uid?: string) => {
  return useSuspenseQuery({
    queryKey: ['badges', 'leaderboard', uid ?? null],
    queryFn: () => client.getBadgeLeaderboard({ queries: { uid } })
  })
}
