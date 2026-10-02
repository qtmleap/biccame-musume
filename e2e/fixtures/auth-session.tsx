import { dehydrate, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from '@/components/auth/auth-provider'
import { useAuth } from '@/hooks/use-auth'
import { useBadges } from '@/hooks/use-badges'
import { useBulkVote } from '@/hooks/use-bulk-vote'
import { useFavorites } from '@/hooks/use-favorites'
import { useUserActivity } from '@/hooks/use-user-activity'
import { useVote } from '@/hooks/use-vote'
import { deserializePublicQueryCache, publicCacheDehydrateOptions } from '@/lib/user-query-keys'

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 300000 } } })
const stored = localStorage.getItem('REACT_QUERY_OFFLINE_CACHE')
if (stored) {
  const persisted = deserializePublicQueryCache(stored)
  for (const query of persisted.clientState.queries) queryClient.setQueryData(query.queryKey, query.state.data)
}

const PrivateData = () => {
  const { favorites } = useFavorites()
  const { stores } = useUserActivity()
  const { earnedMap } = useBadges()
  return (
    <div data-testid='private-data'>
      <p>推し: {favorites.join(',')}</p>
      <p>活動: {stores.join(',')}</p>
      <p>バッジ: {[...earnedMap.keys()].join(',')}</p>
    </div>
  )
}
queryClient.getQueryCache().subscribe(() => {
  localStorage.setItem(
    'REACT_QUERY_OFFLINE_CACHE',
    JSON.stringify({
      timestamp: Date.now(),
      buster: '',
      clientState: dehydrate(queryClient, publicCacheDehydrateOptions)
    })
  )
})
// Kept mounted across account changes, matching activity/vote controls on public pages.
const MutationProbe = () => {
  const activity = useUserActivity()
  const vote = useVote('private-account-a-vote')
  const bulk = useBulkVote()
  const [completion, setCompletion] = useState('未完了')
  return (
    <>
      <button type='button' onClick={() => activity.addVisitedStore('akiba')}>
        活動を追加
      </button>
      <p data-testid='activity-pending'>{String(activity.isAddVisitedStorePending)}</p>
      <button type='button' onClick={() => vote.mutate()}>
        投票を追加
      </button>
      <p data-testid='vote-state'>
        {JSON.stringify({ status: vote.status, data: vote.data, variables: vote.variables })}
      </p>
      <button
        type='button'
        onClick={() => bulk.mutate(['private-account-a-bulk'], { onSuccess: () => setCompletion('完了') })}
      >
        一括投票を追加
      </button>
      <p data-testid='bulk-completion'>{completion}</p>
      <p data-testid='bulk-state'>
        {JSON.stringify({ status: bulk.status, data: bulk.data, variables: bulk.variables })}
      </p>
    </>
  )
}
const App = () => {
  const { user, isAuthenticated, loginWithEmail, logout } = useAuth()
  const [error, setError] = useState('')
  const [showOperations, setShowOperations] = useState(true)
  return (
    <>
      <p data-testid='current-user'>{user === null ? '未ログイン' : user.uid}</p>
      <button type='button' onClick={() => loginWithEmail('account-a', 'test')}>
        Aでログイン
      </button>
      <button type='button' onClick={() => loginWithEmail('account-b', 'test')}>
        Bでログイン
      </button>
      <button
        type='button'
        onClick={() => logout().catch(() => setError('ログアウトに失敗しました。再試行できます。'))}
      >
        ログアウト
      </button>
      <p role='status'>{error}</p>
      <button type='button' onClick={() => setShowOperations(false)}>
        操作を閉じる
      </button>
      {showOperations && <MutationProbe />}
      {isAuthenticated && (
        <Suspense fallback={<p>読み込み中</p>}>
          <PrivateData />
        </Suspense>
      )}
    </>
  )
}
const root = document.getElementById('root')
if (root)
  createRoot(root).render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  )
