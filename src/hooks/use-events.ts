import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { Event, EventRequest } from '@/schemas/event.dto'
import { client } from '@/utils/client'

/**
 * イベント一覧を取得するフック
 */
export const useEvents = () => {
  return useSuspenseQuery({
    queryKey: ['events'],
    queryFn: async () => client.getEvents(),
    staleTime: 0, // 常に最新データを取得
    refetchOnMount: true, // マウント時に再取得
    retry: 1, // リトライ回数を1回に制限
    retryDelay: 1000 // 1秒後にリトライ
  })
}

/**
 * 単一イベントを取得するフック
 */
export const useEvent = (eventId: string) => {
  return useSuspenseQuery({
    queryKey: ['events', eventId],
    queryFn: async () => client.getEvent({ params: { id: eventId } }),
    staleTime: 0,
    refetchOnMount: true,
    retry: 1,
    retryDelay: 1000
  })
}

/**
 * 単一イベントを取得するフック（存在しない場合はnullを返す）
 * 新規作成と編集を統合した画面で使用
 */
export const useEventOrNull = (eventId: string) => {
  return useSuspenseQuery({
    queryKey: ['events', eventId],
    queryFn: async () => {
      try {
        return await client.getEvent({ params: { id: eventId } })
      } catch (_error) {
        // 404の場合はnullを返す（新規作成モード）
        return null
      }
    },
    staleTime: 0,
    refetchOnMount: true,
    retry: false // エラー時はリトライしない
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
      toast.success('イベントを登録しました')
      // イベント一覧を再取得
      queryClient.invalidateQueries({ queryKey: ['events'] })
    },
    onError: (error) => {
      toast.error('イベントの登録に失敗しました')
      console.error(error)
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
      await client.deleteEvent(undefined, { params: { id: eventId } })
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
      return await client.updateEvent(data, { params: { id } })
    },
    onSuccess: () => {
      toast.success('イベントを更新しました')
      queryClient.invalidateQueries({ queryKey: ['events'] })
    },
    onError: (error) => {
      toast.error('イベントの更新に失敗しました')
      console.error(error)
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
