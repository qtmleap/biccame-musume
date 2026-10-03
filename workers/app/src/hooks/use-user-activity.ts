import { useQuery, useQueryClient } from '@tanstack/react-query'
import { isCurrentAccountMutation, useAccountMutation } from '@/hooks/use-account-mutation'
import { useAuth } from '@/hooks/use-auth'
import { userQueryKeys } from '@/lib/user-query-keys'
import { client } from '@/utils/client'

const BADGE_REFETCH_DELAY_MS = 2500

/**
 * 未認証/初期表示時のフォールバック。 initialData として渡すことで data 自体が
 * 必ず defined になり、 呼び出し側で `data?.` や `?? []` が不要になる。
 * initialDataUpdatedAt: 0 で常に stale 扱いとし、 認証された瞬間にネットワーク取得が走る。
 */
const EMPTY_ACTIVITY = {
  stores: [] as string[],
  events: { interested: [] as string[], completed: [] as string[] }
} as const

/**
 * ユーザーアクティビティを取得・操作するカスタムフック
 */
export const useUserActivity = () => {
  const queryClient = useQueryClient()
  const { isAuthenticated, user } = useAuth()
  const queryKey = userQueryKeys.activities(user === null ? '' : user.uid)

  const { data } = useQuery({
    queryKey,
    meta: { persist: false },
    queryFn: async () => {
      return client.getUserActivities()
    },
    enabled: isAuthenticated,
    initialData: EMPTY_ACTIVITY,
    initialDataUpdatedAt: 0
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey })
  }

  // 訪問済み店舗
  const addVisitedStore = useAccountMutation('add-visited-store', {
    mutationFn: async (storeKey: string) => {
      return client.updateUserStore({ status: 'visited' }, { params: { storeKey } })
    },
    onSuccess: (_data, _variables, _result, context) => {
      invalidate()
      // バッジ評価はサーバー側で waitUntil 実行されるため、少し遅らせて再取得
      setTimeout(() => {
        if (!isCurrentAccountMutation(context)) return
        queryClient.invalidateQueries({ queryKey: userQueryKeys.badges(user === null ? '' : user.uid) })
      }, BADGE_REFETCH_DELAY_MS)
    }
  })

  const removeVisitedStore = useAccountMutation('remove-visited-store', {
    mutationFn: async (storeKey: string) => {
      return client.deleteUserStore(undefined, { params: { storeKey } })
    },
    onSuccess: invalidate
  })

  // 興味のあるイベント
  const addInterestedEvent = useAccountMutation('add-interested-event', {
    mutationFn: async (eventId: string) => {
      return client.updateUserEvent({ status: 'interested' }, { params: { eventId } })
    },
    onSuccess: invalidate
  })

  const removeInterestedEvent = useAccountMutation('remove-interested-event', {
    mutationFn: async (eventId: string) => {
      return client.deleteUserEvent(undefined, { params: { eventId }, queries: { status: 'interested' } })
    },
    onSuccess: invalidate
  })

  // 達成済みイベント
  const addCompletedEvent = useAccountMutation('add-completed-event', {
    mutationFn: async (eventId: string) => {
      return client.updateUserEvent({ status: 'completed' }, { params: { eventId } })
    },
    onSuccess: (_data, _variables, _result, context) => {
      invalidate()
      // バッジ評価はサーバー側で waitUntil 実行されるため、少し遅らせて再取得
      setTimeout(() => {
        if (!isCurrentAccountMutation(context)) return
        queryClient.invalidateQueries({ queryKey: userQueryKeys.badges(user === null ? '' : user.uid) })
      }, BADGE_REFETCH_DELAY_MS)
    }
  })

  const removeCompletedEvent = useAccountMutation('remove-completed-event', {
    mutationFn: async (eventId: string) => {
      return client.deleteUserEvent(undefined, { params: { eventId }, queries: { status: 'completed' } })
    },
    onSuccess: invalidate
  })

  return {
    stores: data.stores,
    interestedEvents: data.events.interested,
    completedEvents: data.events.completed,
    // 訪問済み店舗
    addVisitedStore: addVisitedStore.mutate,
    removeVisitedStore: removeVisitedStore.mutate,
    isAddVisitedStorePending: addVisitedStore.isPending,
    isRemoveVisitedStorePending: removeVisitedStore.isPending,
    isVisited: (storeKey: string) => data.stores.includes(storeKey),
    // 興味のあるイベント
    addInterestedEvent: addInterestedEvent.mutate,
    removeInterestedEvent: removeInterestedEvent.mutate,
    isInterested: (eventId: string) => data.events.interested.includes(eventId),
    // 達成済みイベント
    addCompletedEvent: addCompletedEvent.mutate,
    removeCompletedEvent: removeCompletedEvent.mutate,
    isCompleted: (eventId: string) => data.events.completed.includes(eventId)
  }
}
