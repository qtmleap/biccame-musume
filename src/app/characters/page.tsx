import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import type { Metadata } from 'next'
import { charactersQueryKey } from '@/hooks/useCharacters'
import { getCharacters } from '@/lib/characters'
import { CharactersClient } from './characters-client'

export const metadata: Metadata = {
  title: 'ビッカメ娘一覧',
  description:
    'ビッカメ娘一覧 | ビッカメ娘公式WEB。ビッカメ娘はビックカメラの店舗擬人化プロジェクトとして活動しています。',
  openGraph: {
    title: 'ビッカメ娘一覧 | ビッカメ娘 -ビックカメラ店舗擬人化プロジェクト-',
    description:
      'ビッカメ娘一覧 | ビッカメ娘公式WEB。ビッカメ娘はビックカメラの店舗擬人化プロジェクトとして活動しています。'
  }
}

/**
 * キャラクター一覧ページ（Server Component）
 */
const CharactersPage = async () => {
  const queryClient = new QueryClient()

  await queryClient.prefetchQuery({
    queryKey: charactersQueryKey,
    queryFn: getCharacters
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CharactersClient />
    </HydrationBoundary>
  )
}

export default CharactersPage
