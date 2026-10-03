import type { QueryClient, QueryKey } from '@tanstack/react-query'
import type { PersistedClient } from '@tanstack/react-query-persist-client'

export const userQueryKeys = {
  favorites: (uid: string) => ['user', uid, 'favorites'] as const,
  activities: (uid: string) => ['user', uid, 'activities'] as const,
  badges: (uid: string) => ['user', uid, 'badges'] as const
}

const isLiveAdminQueryKey = (key: QueryKey): boolean =>
  (key[0] === 'admin' && (key[1] === 'twitter' || key[1] === 'users')) || (key[0] === 'comments' && key[1] === 'admin')

export const isUserQueryKey = (key: QueryKey): boolean =>
  key[0] === 'user' || key[0] === 'me' || key[0] === 'user_activities'

export const shouldPersistQuery = (query: {
  queryKey: QueryKey
  meta?: Record<string, unknown>
  state: { status: string }
}): boolean =>
  query.state.status === 'success' &&
  query.meta?.persist !== false &&
  !isUserQueryKey(query.queryKey) &&
  !isLiveAdminQueryKey(query.queryKey)

export const publicCacheDehydrateOptions = {
  shouldDehydrateQuery: shouldPersistQuery,
  shouldDehydrateMutation: () => false
}

// Filter before hydration, including cache entries saved by older app versions.
export const deserializePublicQueryCache = (serialized: string): PersistedClient => {
  const persisted: PersistedClient = JSON.parse(serialized)
  persisted.clientState.queries = persisted.clientState.queries.filter(
    (query) => !isUserQueryKey(query.queryKey) && !isLiveAdminQueryKey(query.queryKey) && query.meta?.persist !== false
  )
  persisted.clientState.mutations = []
  return persisted
}

export const clearUserQueries = async (queryClient: QueryClient): Promise<void> => {
  const filters = { predicate: (query: { queryKey: QueryKey }) => isUserQueryKey(query.queryKey) }
  await queryClient.cancelQueries(filters)
  queryClient.removeQueries(filters)
  // Mutations can retain private responses and variables after account replacement.
  queryClient.getMutationCache().clear()
}
