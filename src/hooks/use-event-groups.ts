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
 * イベントグループ詳細（公開ページ用）
 */
export const useEventGroup = (id: string) => {
  return useSuspenseQuery({
    queryKey: ['event-groups', 'public', id],
    queryFn: async () => client.getEventGroup({ params: { id } }),
    staleTime: 0,
    refetchOnMount: true,
    retry: 1,
    retryDelay: 1000
  })
}

/**
 * イベントグループ詳細（管理画面の編集用、未検証 Event も含む）
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
 * 同上だが、コピー作成画面のように id が空 or 存在しない場合に null を返す
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
      queryClient.invalidateQueries({ queryKey: ['event-groups', 'public', updated.uuid] })
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

/**
 * 指定 Event をグループに紐付ける（一括）
 */
export const useLinkEventsToGroup = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ groupId, eventIds }: { groupId: string; eventIds: string[] }) => {
      return client.linkEventsToGroup({ eventIds }, { params: { id: groupId } })
    },
    onSuccess: (result, { groupId }) => {
      toast.success(`${result.updated} 件のイベントをグループに追加しました`)
      queryClient.invalidateQueries({ queryKey: ['event-groups'] })
      queryClient.invalidateQueries({ queryKey: ['event-groups', 'admin', groupId] })
      queryClient.invalidateQueries({ queryKey: ['events'] })
    },
    onError: (error) => {
      toast.error('イベントの紐付けに失敗しました')
      console.error(error)
    }
  })
}

/**
 * 指定 Event のグループ所属を解除（一括）
 */
export const useUnlinkEventsFromGroup = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ groupId, eventIds }: { groupId: string; eventIds: string[] }) => {
      return client.unlinkEventsFromGroup({ eventIds }, { params: { id: groupId } })
    },
    onSuccess: (result, { groupId }) => {
      toast.success(`${result.updated} 件のイベントをグループから外しました`)
      queryClient.invalidateQueries({ queryKey: ['event-groups'] })
      queryClient.invalidateQueries({ queryKey: ['event-groups', 'admin', groupId] })
      queryClient.invalidateQueries({ queryKey: ['events'] })
    },
    onError: (error) => {
      toast.error('イベントの所属解除に失敗しました')
      console.error(error)
    }
  })
}

export type { EventGroup, EventGroupDetail, EventGroupRequest }
