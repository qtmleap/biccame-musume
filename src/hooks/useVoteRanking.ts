import { useSuspenseQuery } from '@tanstack/react-query'
import type { Character } from '@/schemas/character.dto'
import type { VoteCount } from '@/schemas/vote.dto'

type CharacterWithVotes = Character & {
  voteCount: number
}

/**
 * 全キャラクターの投票数を取得
 */
const fetchVoteRanking = async (characters: Character[]): Promise<CharacterWithVotes[]> => {
  const voteCounts = await Promise.all(
    characters.map(async (character) => {
      try {
        const response = await fetch(`/api/votes/${character.key}`)
        if (!response.ok) return { ...character, voteCount: 0 }
        const data: VoteCount = await response.json()
        return { ...character, voteCount: data.count || 0 }
      } catch {
        return { ...character, voteCount: 0 }
      }
    })
  )

  return voteCounts.sort((a, b) => b.voteCount - a.voteCount)
}

/**
 * 投票ランキング取得用のカスタムフック
 */
export const useVoteRanking = (characters: Character[]) => {
  return useSuspenseQuery({
    queryKey: ['voteRanking', characters.length],
    queryFn: () => fetchVoteRanking(characters),
    staleTime: 1000 * 30, // 30秒間キャッシュ
    refetchInterval: 1000 * 60 // 1分ごとに再取得
  })
}
