'use client'

import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
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
import { QueryClient } from '@tanstack/react-query'

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
      staleTime: 1000 * 60 * 10, // 10分間はデータを新鮮とみなす
      gcTime: 1000 * 60 * 60 * 24, // 24時間キャッシュを保持
      refetchInterval: false,
      refetchOnMount: false, // falseに戻す
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      retry: 0,
      // キャッシュが利用可能なときは即座に返す
      networkMode: 'offlineFirst'
    }
  }
})

const persister = createAsyncStoragePersister({
  storage: window.localStorage,
  throttleTime: 1000, // 1秒間隔で保存（より頻繁に）
  key: 'REACT_QUERY_OFFLINE_CACHE',
  serialize: JSON.stringify,
  deserialize: JSON.parse
})

// Render the app
// biome-ignore lint/style/noNonNullAssertion: reason
const rootElement = document.getElementById('root')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <PersistQueryClientProvider
        client={client}
        persistOptions={{
          persister: persister,
          maxAge: 1000 * 60, // 1分間キャッシュ
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
}
