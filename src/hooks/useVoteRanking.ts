import { useSuspenseQuery } from '@tanstack/react-query'
import type { Character } from '@/schemas/character.dto'
import { voteClient } from '@/utils/client'

type CharacterWithVotes = Character & {
  voteCount: number
}

/**
 * 開発環境かどうかを判定
 */
const isDevelopment = () => {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
}

/**
 * 開発環境用のダミー投票データを生成（合計約10万票）
 */
const generateDummyVoteCounts = (characters: Character[]): Record<string, number> => {
  const totalTargetVotes = 100000
  const dummyCounts: Record<string, number> = {}

  // 上位キャラクターに多く票が集まるようにする（指数的減少）
  const weights = characters.map((_, index) => 0.85 ** index)
  const totalWeight = weights.reduce((sum, w) => sum + w, 0)

  for (const [index, character] of characters.entries()) {
    // 重みに基づいて票を配分し、ランダム性を加える
    const baseVotes = Math.floor((weights[index] / totalWeight) * totalTargetVotes)
    const randomFactor = 0.8 + Math.random() * 0.4 // 0.8〜1.2の範囲
    dummyCounts[character.key] = Math.floor(baseVotes * randomFactor)
  }

  return dummyCounts
}

/**
 * 全キャラクターの投票数を取得
 */
const fetchVoteRanking = async (characters: Character[]): Promise<CharacterWithVotes[]> => {
  // 開発環境ではダミーデータを使用
  const allVoteCounts = isDevelopment() ? generateDummyVoteCounts(characters) : await voteClient.getAllVoteCounts()

  // キャラクターと投票数をマージ
  const voteCounts = characters.map((character) => ({
    ...character,
    voteCount: allVoteCounts[character.key] || 0
  }))

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
