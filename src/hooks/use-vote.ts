import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { resolveBadgeText } from '@/lib/badge-display'
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
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => submitVote(characterId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ranking'] })
      for (const badge of data.newBadges) {
        const { name, description } = resolveBadgeText(badge)
        toast.success(`バッジ獲得: ${name}`, { description })
      }
      if (data.newBadges.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['me', 'badges'] })
      }
    }
  })
}
