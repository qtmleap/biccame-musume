import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Event, EventRequest } from '@/schemas/event.dto'
import { client } from '@/utils/client'

/**
 * イベント一覧を取得するフック
 */
export const useEvents = () => {
  return useQuery({
    queryKey: ['events'],
    queryFn: async () => client.getEvents(),
    staleTime: 0, // 常に最新データを取得
    refetchOnMount: true, // マウント時に再取得
    retry: 1, // リトライ回数を1回に制限
    retryDelay: 1000 // 1秒後にリトライ
  })
}

/**
 * イベントを作成するフック
 */
export const useCreateEvent = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (event: EventRequest): Promise<Event> => {
      return client.createEvent(event)
    },
    onSuccess: () => {
      // イベント一覧を再取得
      queryClient.invalidateQueries({ queryKey: ['events'] })
    }
  })
}

/**
 * イベントを削除するフック
 */
export const useDeleteEvent = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (eventId: string): Promise<void> => {
      await client.deleteEvent(undefined, { params: { eventId } })
    },
    onSuccess: () => {
      // イベント一覧を再取得
      queryClient.invalidateQueries({ queryKey: ['events'] })
    }
  })
}

/**
 * イベントを更新するフック
 */
export const useUpdateEvent = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<EventRequest> }): Promise<Event> => {
      console.log('[Hook] Update event mutation started:', { id, data })
      try {
        const result = await client.updateEvent(data, { params: { eventId: id } })
        console.log('[Hook] Update event mutation succeeded:', result)
        return result
      } catch (error) {
        console.error('[Hook] Update event mutation failed:', error)
        throw error
      }
    },
    onSuccess: (_data) => {
      console.log('[Hook] Update event onSuccess, invalidating queries...')
      // イベント一覧を再取得
      queryClient.invalidateQueries({ queryKey: ['events'] })
    },
    onError: (error) => {
      console.error('[Hook] Update event onError:', error)
    }
  })
}

/**
 * URLの重複をチェックする関数
 */
export const checkDuplicateUrl = async (
  url: string,
  excludeId?: string
): Promise<{ exists: boolean; event?: Event }> => {
  return client.checkDuplicateUrl({ queries: { url, excludeId } })
}
