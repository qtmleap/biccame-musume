import { useSuspenseQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import type { StoreData } from '@/schemas/store.dto'
import { client } from '@/utils/client'

export type CharacterWithVotes = StoreData & {
  voteCount: number
}

/**
 * 投票ランキング取得用のカスタムフック
 */
export const useVoteRanking = () => {
  const targetYear = dayjs().year()

  return useSuspenseQuery({
    queryKey: ['ranking', targetYear],
    queryFn: async () => {
      const [characters, counts] = await Promise.all([
        client.getCharacters(),
        client.getVotes({ queries: { year: targetYear.toString() } })
      ])
      console.log('Characters:', characters, 'Counts:', counts)
      return []
    },
    staleTime: 1000 * 30, // 30秒間キャッシュ
    refetchInterval: 1000 * 60, // 1分ごとに再取得
    refetchOnMount: true,
    refetchOnWindowFocus: true
  })
}
