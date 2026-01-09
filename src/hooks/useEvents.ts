import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  AckeyCampaign,
  CreateAckeyCampaignRequest,
  UpdateAckeyCampaignRequest
} from '@/schemas/event.dto'
import { client } from '@/utils/client'

/**
 * イベント一覧を取得するフック
 */
export const useEvents = () => {
  return useQuery({
    queryKey: ['events'],
    queryFn: async (): Promise<AckeyCampaign[]> => {
      console.log('Fetching events from API...')
      const data = await client.getEvents()
      console.log('Events data:', data.events)
      return data.events
    },
    staleTime: 0, // 常に最新データを取得
    refetchOnMount: true // マウント時に再取得
  })
}

/**
 * イベントを作成するフック
 */
export const useCreateEvent = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (event: CreateAckeyCampaignRequest): Promise<AckeyCampaign> => {
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
    mutationFn: async ({ id, data }: { id: string; data: UpdateAckeyCampaignRequest }): Promise<AckeyCampaign> => {
      return client.updateEvent(data, { params: { eventId: id } })
    },
    onSuccess: () => {
      // イベント一覧を再取得
      queryClient.invalidateQueries({ queryKey: ['events'] })
    }
  })
}

/**
 * URLの重複をチェックする関数
 */
export const checkDuplicateUrl = async (
  url: string,
  excludeId?: string
): Promise<{ exists: boolean; event?: AckeyCampaign }> => {
  return client.checkDuplicateUrl({ queries: { url, excludeId } })
}
