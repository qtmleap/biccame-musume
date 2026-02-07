import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { client, getAuthHeaders } from '@/utils/client'

/**
 * ユーザーアクティビティを取得・操作するカスタムフック
 * @param userId - Firebase Auth UID
 */
export const useUserActivity = (userId: string | undefined) => {
  const queryClient = useQueryClient()

  const queryKey = ['user-activity', userId]

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!userId) throw new Error('userId is required')
      return client.getUserActivity({ params: { userId } })
    },
    enabled: !!userId
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey })
  }

  // 訪問済み店舗
  const addVisitedStore = useMutation({
    mutationFn: async (storeKey: string) => {
      if (!userId) throw new Error('userId is required')
      const headers = await getAuthHeaders()
      return client.addVisitedStore(undefined, { params: { userId, storeKey }, headers })
    },
    onSuccess: invalidate
  })

  const removeVisitedStore = useMutation({
    mutationFn: async (storeKey: string) => {
      if (!userId) throw new Error('userId is required')
      const headers = await getAuthHeaders()
      return client.removeVisitedStore(undefined, { params: { userId, storeKey }, headers })
    },
    onSuccess: invalidate
  })

  // 興味のあるイベント
  const addInterestedEvent = useMutation({
    mutationFn: async (eventId: string) => {
      if (!userId) throw new Error('userId is required')
      const headers = await getAuthHeaders()
      return client.addInterestedEvent(undefined, { params: { userId, eventId }, headers })
    },
    onSuccess: invalidate
  })

  const removeInterestedEvent = useMutation({
    mutationFn: async (eventId: string) => {
      if (!userId) throw new Error('userId is required')
      const headers = await getAuthHeaders()
      return client.removeInterestedEvent(undefined, { params: { userId, eventId }, headers })
    },
    onSuccess: invalidate
  })

  // 達成済みイベント
  const addCompletedEvent = useMutation({
    mutationFn: async (eventId: string) => {
      if (!userId) throw new Error('userId is required')
      const headers = await getAuthHeaders()
      return client.addCompletedEvent(undefined, { params: { userId, eventId }, headers })
    },
    onSuccess: invalidate
  })

  const removeCompletedEvent = useMutation({
    mutationFn: async (eventId: string) => {
      if (!userId) throw new Error('userId is required')
      const headers = await getAuthHeaders()
      return client.removeCompletedEvent(undefined, { params: { userId, eventId }, headers })
    },
    onSuccess: invalidate
  })

  return {
    visitedStores: data?.visitedStores ?? [],
    interestedEvents: data?.interestedEvents ?? [],
    completedEvents: data?.completedEvents ?? [],
    isLoading,
    // 訪問済み店舗
    addVisitedStore: addVisitedStore.mutate,
    removeVisitedStore: removeVisitedStore.mutate,
    isVisited: (storeKey: string) => data?.visitedStores.includes(storeKey) ?? false,
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
