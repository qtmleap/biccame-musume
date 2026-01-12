import { useSuspenseQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { keyBy, orderBy } from 'lodash-es'
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
        client.getVotes()
      ])

      // 投票数をオブジェクトに変換
      const voteMap = keyBy(counts, 'key')

      // キャラクターに投票数を付与
      const charactersWithVotes: CharacterWithVotes[] = characters.map((character) => ({
        ...character,
        voteCount: voteMap[character.id]?.count || 0
      }))

      // 投票数でソート（降順）
      return orderBy(charactersWithVotes, ['voteCount'], ['desc'])
    },
    staleTime: 1000 * 30, // 30秒間キャッシュ
    refetchInterval: 1000 * 60, // 1分ごとに再取得
    refetchOnMount: true,
    refetchOnWindowFocus: true
  })
}
