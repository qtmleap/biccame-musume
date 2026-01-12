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
const fetchVoteRanking = async (characters: StoreData[], year: number): Promise<CharacterWithVotes[]> => {
  // Zodiosを使ってAPIリクエスト
  const rawData = await client.getAllVoteCounts({ queries: { year: year.toString() } })

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
export const useVoteRanking = (characters: StoreData[], year?: number) => {
  const targetYear = year || dayjs().year()

  return useSuspenseQuery({
    queryKey: ['ranking', targetYear],
    queryFn: () => fetchVoteRanking(characters, targetYear),
    staleTime: 1000 * 30, // 30秒間キャッシュ
    refetchInterval: 1000 * 60, // 1分ごとに再取得
    refetchOnMount: true,
    refetchOnWindowFocus: true
  })
}
