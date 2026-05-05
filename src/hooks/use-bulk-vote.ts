import { useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useSetAtom } from 'jotai'
import { lastVoteTimesAtom } from '@/atoms/vote-atom'
import type { BulkVoteResponse } from '@/schemas/vote.dto'
import { client } from '@/utils/client'

/**
 * 一括投票フック
 * 成功時は voted 判定された characterId 全件で localStorage の最終投票時刻を更新する
 */
export const useBulkVote = () => {
  const queryClient = useQueryClient()
  const setLastVoteTimes = useSetAtom(lastVoteTimesAtom)

  return useMutation({
    mutationFn: (characterIds: string[]): Promise<BulkVoteResponse> => client.createBulkVote({ characterIds }),
    onSuccess: (data) => {
      const now = dayjs().toISOString()
      setLastVoteTimes((prev) => {
        const next = { ...prev }
        for (const item of data.results) {
          if (item.status === 'voted') {
            next[item.characterId] = now
          }
        }
        return next
      })
      queryClient.invalidateQueries({ queryKey: ['ranking'] })
    }
  })
}
