import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { client, getAuthHeaders } from '@/utils/client'

/**
 * ユーザーアクティビティを取得・操作するカスタムフック
 */
export const useUserActivity = () => {
  const queryClient = useQueryClient()

  const queryKey = ['user-activity']

  const { data } = useSuspenseQuery({
    queryKey,
    queryFn: async () => {
      return client.getUserActivities()
    }
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey })
  }

  // 訪問済み店舗
  const addVisitedStore = useMutation({
    mutationFn: async (storeKey: string) => {
      const headers = await getAuthHeaders()
      return client.updateUserStore({ status: 'visited' }, { params: { storeKey }, headers })
    },
    onSuccess: invalidate
  })

  const removeVisitedStore = useMutation({
    mutationFn: async (storeKey: string) => {
      const headers = await getAuthHeaders()
      return client.deleteUserStore(undefined, { params: { storeKey }, headers })
    },
    onSuccess: invalidate
  })

  // 興味のあるイベント
  const addInterestedEvent = useMutation({
    mutationFn: async (eventId: string) => {
      const headers = await getAuthHeaders()
      return client.updateUserEvent({ status: 'interested' }, { params: { eventId }, headers })
    },
    onSuccess: invalidate
  })

  const removeInterestedEvent = useMutation({
    mutationFn: async (eventId: string) => {
      const headers = await getAuthHeaders()
      return client.deleteUserEvent(undefined, { params: { eventId }, queries: { status: 'interested' }, headers })
    },
    onSuccess: invalidate
  })

  // 達成済みイベント
  const addCompletedEvent = useMutation({
    mutationFn: async (eventId: string) => {
      const headers = await getAuthHeaders()
      return client.updateUserEvent({ status: 'completed' }, { params: { eventId }, headers })
    },
    onSuccess: invalidate
  })

  const removeCompletedEvent = useMutation({
    mutationFn: async (eventId: string) => {
      const headers = await getAuthHeaders()
      return client.deleteUserEvent(undefined, { params: { eventId }, queries: { status: 'completed' }, headers })
    },
    onSuccess: invalidate
  })

  return {
    stores: data?.stores ?? [],
    interestedEvents: data?.interestedEvents ?? [],
    completedEvents: data?.completedEvents ?? [],
    // 訪問済み店舗
    addVisitedStore: addVisitedStore.mutate,
    removeVisitedStore: removeVisitedStore.mutate,
    isVisited: (storeKey: string) => data?.stores.includes(storeKey) ?? false,
    // 興味のあるイベント
    addInterestedEvent: addInterestedEvent.mutate,
    removeInterestedEvent: removeInterestedEvent.mutate,
    isInterested: (eventId: string) => data?.interestedEvents.includes(eventId) ?? false,
    // 達成済みイベント
    addCompletedEvent: addCompletedEvent.mutate,
    removeCompletedEvent: removeCompletedEvent.mutate,
    isCompleted: (eventId: string) => data?.completedEvents.includes(eventId) ?? false
  }
}
