import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { VoteResponse } from '@/schemas/vote.dto'
import { voteClient } from '@/utils/client'

/**
 * 投票カウントを取得
 */
const fetchVoteCount = async (characterId: string): Promise<number> => {
  const data = await voteClient.getVoteCount({ params: { characterId } })
  return data.count
}

/**
 * 投票を送信
 */
const submitVote = async (characterId: string): Promise<VoteResponse> => {
  return await voteClient.submitVote({ characterId })
}

/**
 * 投票機能のカスタムフック
 */
export const useVote = (characterId: string) => {
  const queryClient = useQueryClient()

  // 投票カウント取得
  const { data: voteCount = 0, isLoading } = useQuery({
    queryKey: ['voteCount', characterId],
    queryFn: () => fetchVoteCount(characterId),
    staleTime: 30000, // 30秒間キャッシュ
    refetchInterval: 60000 // 1分ごとに再取得
  })

  // 投票実行
  const voteMutation = useMutation({
    mutationFn: () => submitVote(characterId),
    onSuccess: (data) => {
      // カウントを更新
      if (data.count !== undefined) {
        queryClient.setQueryData(['voteCount', characterId], data.count)
      } else {
        queryClient.invalidateQueries({ queryKey: ['voteCount', characterId] })
      }
    }
  })

  return {
    voteCount,
    isLoading,
    vote: voteMutation.mutate,
    isVoting: voteMutation.isPending,
    isSuccess: voteMutation.isSuccess,
    error: voteMutation.error as Error | null,
    nextVoteDate: voteMutation.data?.nextVoteDate
  }
}
