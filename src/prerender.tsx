import { dehydrate, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router'
// dayjsの設定
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
// JSONファイルを直接インポート（Viteが処理）
import charactersJson from '../public/characters.json'
import { routeTree } from './app/routeTree.gen'
import { charactersQueryKey } from './hooks/useCharacters'
import { CharactersSchema } from './schemas/character.dto'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault('Asia/Tokyo')

/**
 * キャラクターデータを取得（ビルド時に埋め込まれる）
 */
const getCharacters = () => {
  return CharactersSchema.parse(charactersJson)
}

/**
 * プリレンダリング用関数
 * vite-prerender-plugin から呼び出される
 */
export const prerender = async (data: { url: string }) => {
  const { url } = data

  // QueryClient を作成
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 60 * 24,
        retry: 0
      }
    }
  })

  // JSONからデータを取得してキャッシュに設定
  const characters = getCharacters()
  queryClient.setQueryData(charactersQueryKey, characters)

  // メモリ内ルーターを作成
  const memoryHistory = createMemoryHistory({
    initialEntries: [url]
  })

  const router = createRouter({
    routeTree,
    history: memoryHistory
  })

  // ルーターのロードを待機
  await router.load()

  // HTMLをレンダリング
  const html = renderToString(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>
  )

  // プリフェッチしたデータをシリアライズ
  const dehydratedState = dehydrate(queryClient)

  // dehydrated state をHTMLに埋め込む（クライアント側でハイドレート用）
  const dehydratedScript = `<script id="__REACT_QUERY_STATE__" type="application/json">${JSON.stringify(dehydratedState)}</script>`
  const htmlWithState = `${html}${dehydratedScript}`

  // リンクを解析して追加のプリレンダー対象を検出
  const { parseLinks } = await import('vite-prerender-plugin/parse')
  const links = parseLinks(html)

  return {
    html: htmlWithState,
    links: new Set(links),
    head: {
      lang: 'ja',
      title: getPageTitle(url)
    }
  }
}

/**
 * URLに応じたページタイトルを取得
 */
const getPageTitle = (url: string): string => {
  const titles: Record<string, string> = {
    '/': 'ビッカメ娘 非公式ファンサイト',
    '/about': 'このサイトについて | ビッカメ娘 非公式ファンサイト',
    '/calendar': '誕生日カレンダー | ビッカメ娘 非公式ファンサイト',
    '/characters': 'キャラクター一覧 | ビッカメ娘 非公式ファンサイト',
    '/contact': 'お問い合わせ | ビッカメ娘 非公式ファンサイト',
    '/location': '店舗マップ | ビッカメ娘 非公式ファンサイト',
    '/ranking': 'ランキング | ビッカメ娘 非公式ファンサイト'
  }
  return titles[url] || 'ビッカメ娘 非公式ファンサイト'
}
