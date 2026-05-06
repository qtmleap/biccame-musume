import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { CreateSpecialBadgeBody, UpdateBadgeBody } from '@/schemas/badge.dto'
import { client } from '@/utils/client'

export const useAllBadges = () => {
  return useSuspenseQuery({
    queryKey: ['badges', 'admin', 'all'],
    queryFn: () => client.getBadges({ queries: { includeHidden: '1' } }),
    staleTime: 0
  })
}

/**
 * 管理者向け: 特別バッジを作成するフック
 */
export const useCreateSpecialBadge = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateSpecialBadgeBody) => client.createSpecialBadge(body),
    onSuccess: () => {
      toast.success('バッジを作成しました')
      queryClient.invalidateQueries({ queryKey: ['badges'] })
      queryClient.invalidateQueries({ queryKey: ['me', 'badges'] })
    },
    onError: () => {
      toast.error('バッジの作成に失敗しました')
    }
  })
}

/**
 * 管理者向け: バッジを更新するフック
 */
export const useUpdateBadge = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ code, body }: { code: string; body: UpdateBadgeBody }) =>
      client.updateBadge(body, { params: { code } }),
    onSuccess: () => {
      toast.success('バッジを更新しました')
      queryClient.invalidateQueries({ queryKey: ['badges'] })
      queryClient.invalidateQueries({ queryKey: ['me', 'badges'] })
    },
    onError: () => {
      toast.error('バッジの更新に失敗しました')
    }
  })
}

/**
 * 管理者向け: 特別バッジを削除するフック
 */
export const useDeleteBadge = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (code: string) => client.deleteBadge(undefined, { params: { code } }),
    onSuccess: () => {
      toast.success('バッジを削除しました')
      queryClient.invalidateQueries({ queryKey: ['badges'] })
      queryClient.invalidateQueries({ queryKey: ['me', 'badges'] })
    },
    onError: () => {
      toast.error('バッジの削除に失敗しました')
    }
  })
}
