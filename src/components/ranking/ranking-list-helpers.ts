import type { StoreData } from '@/schemas/store.dto'

export type CharacterWithVotes = StoreData & {
  voteCount: number
}

export type CardProps = {
  character: CharacterWithVotes
  rank: number
  index: number
  maxVote: number
  /** 紙の傾き（degrees）。未指定なら順位ごとの既定、0 で傾きなし。 */
  rotation?: number
}

/**
 * 順位を計算（同数の場合は同じ順位）
 */
export const calculateRanks = (characters: CharacterWithVotes[]): number[] => {
  const ranks: number[] = []
  for (let i = 0; i < characters.length; i++) {
    if (i === 0) {
      ranks.push(1)
    } else if (characters[i].voteCount === characters[i - 1].voteCount) {
      ranks.push(ranks[i - 1])
    } else {
      ranks.push(i + 1)
    }
  }
  return ranks
}

/**
 * 順位ごとのバー色
 */
export const getBarClass = (rank: number) => {
  if (rank === 1) return 'bg-rank-gold'
  if (rank === 2) return 'bg-rank-silver'
  if (rank === 3) return 'bg-rank-bronze'
  return 'bg-favorite/60'
}
