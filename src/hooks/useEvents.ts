import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AckeyCampaign, CreateAckeyCampaignRequest } from '@/schemas/ackey-campaign.dto'

const API_BASE = '/api/events'

/**
 * イベント一覧を取得するフック
 */
export const useEvents = () => {
  return useQuery({
    queryKey: ['events'],
    queryFn: async (): Promise<AckeyCampaign[]> => {
      console.log('Fetching events from API...')
      const response = await fetch(API_BASE)
      console.log('Response status:', response.status)
      if (!response.ok) {
        throw new Error('Failed to fetch events')
      }
      const data = (await response.json()) as { events: AckeyCampaign[] }
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
      const response = await fetch(API_BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(event)
      })

      if (!response.ok) {
        const error = (await response.json()) as { error?: string }
        throw new Error(error.error || 'Failed to create event')
      }

      return response.json()
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
      const response = await fetch(`${API_BASE}/${eventId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const error = (await response.json()) as { error?: string }
        throw new Error(error.error || 'Failed to delete event')
      }
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
    mutationFn: async ({ id, data }: { id: string; data: Partial<AckeyCampaign> }): Promise<AckeyCampaign> => {
      const response = await fetch(`${API_BASE}/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      })

      if (!response.ok) {
        const error = (await response.json()) as { error?: string }
        throw new Error(error.error || 'Failed to update event')
      }

      return response.json()
    },
    onSuccess: () => {
      // イベント一覧を再取得
      queryClient.invalidateQueries({ queryKey: ['events'] })
    }
  })
}
