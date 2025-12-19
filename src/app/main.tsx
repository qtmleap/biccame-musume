'use client'

import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { hydrate, QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createRouter, RouterProvider } from '@tanstack/react-router'
// dayjs設定
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from '@/components/ui/sonner'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault('Asia/Tokyo')

// Import the generated route tree
import { routeTree } from './routeTree.gen'

import '../index.css'

// ルーターインスタンスを作成（ページ遷移時にスクロール位置をトップにリセット）
const router = createRouter({
  routeTree,
  defaultPreloadStaleTime: 0,
  scrollRestoration: true
})

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const client = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5分間はデータを新鮮とみなす
      gcTime: 1000 * 60 * 60 * 24, // 24時間キャッシュを保持
      refetchInterval: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      retry: 0,
      // キャッシュが利用可能なときは即座に返す
      networkMode: 'offlineFirst'
    }
  }
})

// プリレンダリング時に埋め込まれたデータをハイドレート
const dehydratedStateEl = document.getElementById('__REACT_QUERY_STATE__')
if (dehydratedStateEl?.textContent) {
  try {
    const dehydratedState = JSON.parse(dehydratedStateEl.textContent)
    hydrate(client, dehydratedState)
  } catch (e) {
    console.error('Failed to hydrate React Query state:', e)
  }
}

const persister = createAsyncStoragePersister({
  storage: window.localStorage,
  throttleTime: 3000, // 3秒間隔で保存(LocalStorage書き込み負荷を軽減)
  key: 'REACT_QUERY_OFFLINE_CACHE',
  serialize: JSON.stringify,
  deserialize: JSON.parse
})

// biome-ignore lint/style/noNonNullAssertion: reason
const rootElement = document.getElementById('root')!

const App = () => (
  <StrictMode>
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister: persister,
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7日間LocalStorageに保持
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            // 成功したクエリのみをキャッシュ対象にする
            return query.state.status === 'success'
          }
        }
      }}
    >
      <RouterProvider router={router} />
      <Toaster />
    </PersistQueryClientProvider>
  </StrictMode>
)

// プリレンダリング済みのHTMLがある場合はhydrate、なければcreateRoot
if (rootElement.innerHTML.trim()) {
  ReactDOM.hydrateRoot(rootElement, <App />)
} else {
  ReactDOM.createRoot(rootElement).render(<App />)
}
