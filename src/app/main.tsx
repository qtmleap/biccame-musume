'use client'

import { registerSW } from 'virtual:pwa-register'
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

// フォントのインポート
import '@fontsource/noto-sans-jp/400.css'
import '@fontsource/noto-sans-jp/500.css'
import '@fontsource/noto-sans-jp/700.css'
import '@fontsource/zen-maru-gothic/400.css'
import '@fontsource/zen-maru-gothic/500.css'
import '@fontsource/zen-maru-gothic/700.css'
import '@fontsource/m-plus-1-code/400.css'
import '@fontsource/m-plus-1-code/500.css'
import '@fontsource/m-plus-1-code/700.css'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault('Asia/Tokyo')

// Service Worker登録
registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('New content available, please refresh.')
  },
  onOfflineReady() {
    console.log('App ready to work offline')
  },
  onRegistered(registration: ServiceWorkerRegistration | undefined) {
    console.log('Service Worker registered:', registration)
  },
  onRegisterError(error: unknown) {
    console.error('Service Worker registration failed:', error)
  }
})

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

const persister = createAsyncStoragePersister({
  storage: window.localStorage,
  throttleTime: 3000, // 3秒間隔で保存(LocalStorage書き込み負荷を軽減)
  key: 'REACT_QUERY_OFFLINE_CACHE',
  serialize: JSON.stringify,
  deserialize: JSON.parse
})

/**
 * アプリバージョンをチェックし、新バージョンの場合はキャッシュをクリアする
 */
const checkVersionAndClearCache = () => {
  const STORAGE_KEY = 'APP_VERSION'
  const currentVersion = `${__APP_VERSION__}-${__GIT_HASH__}`
  const storedVersion = localStorage.getItem(STORAGE_KEY)
  const hasOldCache = localStorage.getItem('REACT_QUERY_OFFLINE_CACHE') !== null

  if (!storedVersion) {
    // 初回アクセス（古いバージョンからの更新を含む）
    if (hasOldCache) {
      console.log('Old cache detected on first access. Clearing cache...')
      localStorage.removeItem('REACT_QUERY_OFFLINE_CACHE')
      client.clear()
      console.log('Cache cleared successfully')
    }
    localStorage.setItem(STORAGE_KEY, currentVersion)
    console.log(`Initial version set: ${currentVersion}`)
  } else if (storedVersion !== currentVersion) {
    // バージョンが変更された
    console.log(`Version changed from ${storedVersion} to ${currentVersion}. Clearing cache...`)
    localStorage.removeItem('REACT_QUERY_OFFLINE_CACHE')
    client.clear()
    localStorage.setItem(STORAGE_KEY, currentVersion)
    console.log('Cache cleared successfully')
  } else {
    console.log(`Version unchanged: ${currentVersion}`)
  }
}

// アプリ起動時にバージョンチェックを実行
checkVersionAndClearCache()

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
}
