import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { VoteResponse } from '@/schemas/vote.dto'
import { client } from '@/utils/client'

/**
 * 投票を送信
 */
const submitVote = async (characterId: string): Promise<VoteResponse> => {
  return client.createVote(undefined, { params: { characterId } })
}

/**
 * 投票機能のカスタムフック
 */
export const useVote = (characterId: string) => {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => submitVote(characterId),
    onSuccess: () => {
      // 投票後はランキングを再取得
      client.invalidateQueries({ queryKey: ['ranking'] })
    }
  })
}
