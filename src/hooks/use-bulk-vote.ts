import { useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useSetAtom } from 'jotai'
import { lastVoteTimesAtom } from '@/atoms/vote-atom'
import type { BulkVoteResponse } from '@/schemas/vote.dto'
import { client } from '@/utils/client'

/**
 * サーバー側でバッジ評価が waitUntil 実行されるため、
 * 完了を待ってから ['me', 'badges'] を invalidate するための遅延 (ms)
 */
const BADGE_REFETCH_DELAY_MS = 2500

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
      // バッジ評価はサーバー側で waitUntil 実行されるため、少し遅らせて再取得
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['me', 'badges'] })
      }, BADGE_REFETCH_DELAY_MS)
    }
  })
}
