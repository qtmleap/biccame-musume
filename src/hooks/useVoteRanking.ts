import { useSuspenseQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import type { StoreData } from '@/schemas/store.dto'
import { client } from '@/utils/client'

type CharacterWithVotes = StoreData & {
  voteCount: number
}

/**
 * 全キャラクターの投票数を取得
 */
const _fetchVoteRanking = async (characters: StoreData[], year: number): Promise<CharacterWithVotes[]> => {
  // Zodiosを使ってAPIリクエスト
  const rawData = await client.getVotes({ queries: { year: year.toString() } })

  // 配列からRecord形式に変換
  const allVoteCounts: Record<string, number> = {}
  for (const item of rawData) {
    allVoteCounts[item.key] = item.count
  }

  // キャラクターと投票数をマージ
  const voteCounts = characters.map((character) => ({
    ...character,
    voteCount: allVoteCounts[character.id] || 0
  }))

  return voteCounts.sort((a, b) => b.voteCount - a.voteCount)
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
