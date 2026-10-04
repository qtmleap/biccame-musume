import { useQueryClient } from '@tanstack/react-query'
import { isCurrentAccountMutation, useAccountMutation } from '@/hooks/use-account-mutation'
import { useAuth } from '@/hooks/use-auth'
import { userQueryKeys } from '@/lib/user-query-keys'
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
  const { user } = useAuth()
  return useAccountMutation('vote', {
    mutationFn: () => submitVote(characterId),
    onSuccess: (_data, _variables, _result, context) => {
      queryClient.invalidateQueries({ queryKey: ['ranking'] })
      // バッジ評価はサーバー側で waitUntil 実行されるため、少し遅らせて再取得
      setTimeout(() => {
        if (!isCurrentAccountMutation(context)) return
        queryClient.invalidateQueries({ queryKey: userQueryKeys.badges(user === null ? '' : user.uid) })
      }, BADGE_REFETCH_DELAY_MS)
    }
  })
}
