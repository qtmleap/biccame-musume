import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import type { VoteSuccessResponseSchema } from '@/schemas/vote.dto'

type VoteSuccessResponse = z.infer<typeof VoteSuccessResponseSchema>

/**
 * 投票カウントを取得
 */
const fetchVoteCount = async (_characterId: string): Promise<number> => {
  // TODO: API実装時に修正
  return 0
}

/**
 * 投票を送信
 */
const submitVote = async (_characterId: string): Promise<VoteSuccessResponse> => {
  // TODO: API実装時に修正
  const nextVoteDate = new Date()
  nextVoteDate.setDate(nextVoteDate.getDate() + 1)
  return { success: true, message: 'Vote submitted', nextVoteDate: nextVoteDate.toISOString() }
}

/**
 * 投票機能のカスタムフック
 */
export const useVote = (characterId: string, options?: { enableVoteCount?: boolean }) => {
  const queryClient = useQueryClient()
  const enableVoteCount = options?.enableVoteCount ?? true

  // 投票カウント取得
  const { data: voteCount = 0, isLoading } = useQuery({
    queryKey: ['voteCount', characterId],
    queryFn: () => fetchVoteCount(characterId),
    staleTime: 30000, // 30秒間キャッシュ
    enabled: enableVoteCount
  })

  // 投票実行
  const voteMutation = useMutation({
    mutationFn: () => submitVote(characterId),
    onSuccess: () => {
      // 投票後はカウントを再取得
      queryClient.invalidateQueries({ queryKey: ['voteCount', characterId] })
    }
  })

  return {
    voteCount,
    isLoading,
    vote: voteMutation.mutate,
    isVoting: voteMutation.isPending,
    isSuccess: voteMutation.isSuccess,
    error: voteMutation.error as Error | null,
    voteResponse: voteMutation.data,
    nextVoteDate: voteMutation.data?.nextVoteDate
  }
}
