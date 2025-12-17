import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { VoteCount, VoteResponse } from '@/schemas/vote.dto'

/**
 * 投票カウントを取得
 */
const fetchVoteCount = async (characterId: string): Promise<number> => {
  const response = await fetch(`/api/votes/${characterId}`)
  if (!response.ok) throw new Error('Failed to fetch vote count')
  const data: VoteCount = await response.json()
  return data.count
}

/**
 * 投票を送信
 */
const submitVote = async (characterId: string): Promise<VoteResponse> => {
  const response = await fetch('/api/votes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ characterId })
  })

  const data: VoteResponse = await response.json()

  if (!response.ok) {
    throw new Error(data.message || 'Failed to vote')
  }

  return data
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
