import { expect, test } from 'bun:test'
import { dehydrate, hydrate, QueryClient } from '@tanstack/react-query'
import { serializeSessionOperation } from '@/lib/auth-session'
import {
  clearUserQueries,
  deserializePublicQueryCache,
  publicCacheDehydrateOptions,
  shouldPersistQuery,
  userQueryKeys
} from '@/lib/user-query-keys'

const persisted = (client: QueryClient) =>
  JSON.stringify({ timestamp: Date.now(), buster: '', clientState: dehydrate(client) })

test('private cache data never persists while public catalogue data remains available', async () => {
  const client = new QueryClient()
  client.setQueryData(userQueryKeys.favorites('a'), { favorites: ['a-only'] })
  client.setQueryData(userQueryKeys.activities('a'), { stores: ['a-only'] })
  client.setQueryData(userQueryKeys.badges('a'), { earned: ['a-only'] })
  client.setQueryData(['me', 'favorites'], { favorites: ['legacy-a'] })
  client.setQueryData(['user_activities'], { stores: ['legacy-a'] })
  client.setQueryData(['badges'], { badges: ['public'] })
  await client.fetchQuery({ queryKey: ['other-private'], queryFn: () => 'secret', meta: { persist: false } })
  const state = dehydrate(client, { shouldDehydrateQuery: shouldPersistQuery })
  expect(state.queries.map((query) => query.queryKey)).toEqual([['badges']])
  expect(JSON.stringify(state)).not.toContain('a-only')
  expect(JSON.stringify(state)).not.toContain('secret')
  client.clear()
})

test('restoring an older persisted cache removes all private entries before hydration', async () => {
  const old = new QueryClient()
  old.setQueryData(['me', 'favorites'], { favorites: ['a-only'] })
  old.setQueryData(['me', 'badges'], { earned: ['a-only'] })
  old.setQueryData(['user_activities'], { stores: ['a-only'] })
  old.setQueryData(['user', 'a', 'badges'], { earned: ['a-only'] })
  old.setQueryData(['badges'], { badges: ['public'] })
  await old.fetchQuery({ queryKey: ['other-private'], queryFn: () => 'a-only', meta: { persist: false } })
  const next = new QueryClient()
  hydrate(next, deserializePublicQueryCache(persisted(old)).clientState)
  expect(
    next
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey)
  ).toEqual([['badges']])
  expect(next.getQueryData<{ badges: string[] }>(['badges'])).toEqual({ badges: ['public'] })
  old.clear()
  next.clear()
})

test('account cleanup removes private queries and mutation responses but keeps public queries', async () => {
  const client = new QueryClient()
  client.setQueryData(['user', 'a', 'favorites'], ['a-only'])
  client.setQueryData(['me', 'badges'], ['a-only'])
  client.setQueryData(['user_activities'], ['a-only'])
  client.setQueryData(['badges'], ['public'])
  const mutation = client.getMutationCache().build(client, { mutationFn: async () => 'a-only' })
  await mutation.execute(undefined)
  await clearUserQueries(client)
  expect(
    client
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey)
  ).toEqual([['badges']])
  expect(client.getMutationCache().getAll()).toHaveLength(0)
  client.clear()
})

test('session expiry waits for in-flight cookie creation', async () => {
  const calls: string[] = []
  const gate = Promise.withResolvers<void>()
  const created = serializeSessionOperation(async () => {
    calls.push('create-start')
    await gate.promise
    calls.push('create-end')
  })
  const expired = serializeSessionOperation(async () => {
    calls.push('expire')
  })
  await Promise.resolve()
  expect(calls).toEqual(['create-start'])
  gate.resolve()
  await Promise.all([created, expired])
  expect(calls).toEqual(['create-start', 'create-end', 'expire'])
})

test('failed session operations leave subsequent logout retry available', async () => {
  await expect(
    serializeSessionOperation(async () => {
      throw new Error('unavailable')
    })
  ).rejects.toThrow('unavailable')
  expect(await serializeSessionOperation(async () => 'expired')).toBe('expired')
})

test('production dehydration excludes paused mutations and their private variables', async () => {
  const { onlineManager } = await import('@tanstack/react-query')
  const client = new QueryClient()
  onlineManager.setOnline(false)
  const mutation = client.getMutationCache().build(client, { mutationFn: async (secret: string) => secret })
  const finished = mutation.execute('private-account-a-input')
  try {
    expect(mutation.state.isPaused).toBe(true)
    const dehydrated = dehydrate(client, publicCacheDehydrateOptions)
    expect(dehydrated.mutations).toHaveLength(0)
    expect(JSON.stringify(dehydrated)).not.toContain('private-account-a-input')
  } finally {
    onlineManager.setOnline(true)
    await mutation.continue()
    await finished
    client.clear()
  }
})

 test('live admin queries stay excluded alongside private user cache during save and restore', () => {
  const client = new QueryClient()
  for (const key of [['admin', 'twitter'], ['admin', 'users'], ['comments', 'admin']]) {
    client.setQueryData(key, 'live-admin')
  }
  client.setQueryData(userQueryKeys.favorites('a'), 'private-user')
  client.setQueryData(['characters'], 'public')
  expect(dehydrate(client, publicCacheDehydrateOptions).queries.map((query) => query.queryKey)).toEqual([['characters']])
  expect(deserializePublicQueryCache(persisted(client)).clientState.queries.map((query) => query.queryKey)).toEqual([['characters']])
  client.clear()
})
