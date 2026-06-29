import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { VoteResponse } from '@/schemas/vote.dto'
import { client } from '@/utils/client'

const BADGE_REFETCH_DELAY_MS = 2500

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
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => submitVote(characterId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ranking'] })
      // バッジ評価はサーバー側で waitUntil 実行されるため、少し遅らせて再取得
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['me', 'badges'] })
      }, BADGE_REFETCH_DELAY_MS)
    }
  })
}
