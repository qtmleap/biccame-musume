import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { EventGroup, EventGroupDetail, EventGroupRequest } from '@/schemas/event-group.dto'
import { client } from '@/utils/client'

/**
 * イベントグループ一覧を取得するフック（公開／管理共通）
 */
export const useEventGroups = () => {
  return useSuspenseQuery({
    queryKey: ['event-groups'],
    queryFn: async () => client.getEventGroups(),
    staleTime: 0,
    refetchOnMount: true,
    retry: 1,
    retryDelay: 1000
  })
}

/**
 * イベントグループ詳細（slug から、公開ページ用）
 */
export const useEventGroupBySlug = (slug: string) => {
  return useSuspenseQuery({
    queryKey: ['event-groups', 'slug', slug],
    queryFn: async () => client.getEventGroup({ params: { slug } }),
    staleTime: 0,
    refetchOnMount: true,
    retry: 1,
    retryDelay: 1000
  })
}

/**
 * イベントグループ詳細（id から、管理画面の編集用）
 */
export const useAdminEventGroup = (id: string) => {
  return useSuspenseQuery({
    queryKey: ['event-groups', 'admin', id],
    queryFn: async () => client.getAdminEventGroup({ params: { id } }),
    staleTime: 0,
    refetchOnMount: true,
    retry: 1,
    retryDelay: 1000
  })
}

/**
 * イベントグループ詳細（編集と新規作成を統合した画面用、存在しないと null）
 */
export const useAdminEventGroupOrNull = (id: string) => {
  return useSuspenseQuery({
    queryKey: ['event-groups', 'admin', id || '__none__'],
    queryFn: async () => {
      if (!id) return null
      try {
        return await client.getAdminEventGroup({ params: { id } })
      } catch (_error) {
        return null
      }
    },
    staleTime: 0,
    refetchOnMount: true,
    retry: false
  })
}

/**
 * イベントグループを作成
 */
export const useCreateEventGroup = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (group: EventGroupRequest): Promise<EventGroup> => {
      return client.createEventGroup(group)
    },
    onSuccess: () => {
      toast.success('イベントグループを登録しました')
      queryClient.invalidateQueries({ queryKey: ['event-groups'] })
    },
    onError: (error) => {
      toast.error('イベントグループの登録に失敗しました')
      console.error(error)
    }
  })
}

/**
 * イベントグループを更新
 */
export const useUpdateEventGroup = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: EventGroupRequest }): Promise<EventGroup> => {
      return await client.updateEventGroup(data, { params: { id } })
    },
    onSuccess: (updated: EventGroup) => {
      toast.success('イベントグループを更新しました')
      queryClient.invalidateQueries({ queryKey: ['event-groups'] })
      queryClient.invalidateQueries({ queryKey: ['event-groups', 'admin', updated.uuid] })
      queryClient.invalidateQueries({ queryKey: ['event-groups', 'slug', updated.slug] })
    },
    onError: (error) => {
      toast.error('イベントグループの更新に失敗しました')
      console.error(error)
    }
  })
}

/**
 * イベントグループを削除
 */
export const useDeleteEventGroup = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await client.deleteEventGroup(undefined, { params: { id } })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-groups'] })
    }
  })
}

export type { EventGroup, EventGroupDetail, EventGroupRequest }
